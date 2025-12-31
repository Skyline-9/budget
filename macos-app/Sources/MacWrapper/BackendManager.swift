import Foundation
import Darwin

@MainActor
final class BackendManager: ObservableObject {
    @Published var isReady: Bool = false
    @Published var lastError: String? = nil
    @Published private(set) var port: Int = 0

    private let host = "127.0.0.1"
    private var process: Process?
    private var currentToken: UUID?
    private var expectedTerminations: Set<UUID> = []

    var webURL: URL {
        URL(string: "http://\(host):\(port)/")!
    }

    func start() {
        // If already running, do nothing
        if process != nil { return }

        lastError = nil
        isReady = false

        Task {
            await startWithRetries(maxAttempts: 8)
        }
    }

    func stop() {
        stopBackend(expected: true)
        isReady = false
    }

    // MARK: - Startup

    private func startWithRetries(maxAttempts: Int) async {
        for attempt in 1...maxAttempts {
            do {
                let candidatePort = try pickAvailablePort()
                self.port = candidatePort

                try launchBackend(port: candidatePort)

                let ok = await waitForHealth(timeoutSeconds: 15)
                if ok {
                    isReady = true
                    return
                }

                // Not healthy yet — stop and retry.
                stopBackend(expected: true)

                if attempt < maxAttempts {
                    // brief backoff
                    try? await Task.sleep(nanoseconds: 250_000_000)
                }
            } catch {
                stopBackend(expected: true)
                lastError = "Attempt \(attempt) failed: \(error.localizedDescription)"
            }
        }

        if lastError == nil {
            lastError = "Backend failed to start."
        }
        isReady = false
    }

    // MARK: - Process control

    private func launchBackend(port: Int) throws {
        if process != nil { return }

        let backendExe = try resolveBackendExecutable()
        
        // #region agent log
        logDebug(location: "BackendManager.swift:76", message: "Resolved backend executable", data: ["exePath": backendExe.path, "port": port], hypothesisId: "A")
        // #endregion

        let token = UUID()
        currentToken = token

        let p = Process()
        p.executableURL = backendExe
        p.currentDirectoryURL = backendExe.deletingLastPathComponent()

        var env = ProcessInfo.processInfo.environment
        env["MAC_APP_HOST"] = host
        env["MAC_APP_PORT"] = "\(port)"
        env["PYTHONUNBUFFERED"] = "1"
        p.environment = env
        
        // #region agent log
        logDebug(location: "BackendManager.swift:91", message: "Launching backend process", data: ["port": port, "host": host, "workDir": backendExe.deletingLastPathComponent().path, "envPort": env["MAC_APP_PORT"] ?? "nil"], hypothesisId: "C,E")
        // #endregion

        // Pipe logs (optional)
        let out = Pipe()
        let err = Pipe()
        p.standardOutput = out
        p.standardError = err

        out.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if !data.isEmpty, let s = String(data: data, encoding: .utf8) {
                print("[backend] \(s)", terminator: "")
                // #region agent log
                logDebug(location: "BackendManager.swift:100", message: "Backend stdout", data: ["output": s], hypothesisId: "C,E")
                // #endregion
            }
        }
        err.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if !data.isEmpty, let s = String(data: data, encoding: .utf8) {
                print("[backend:err] \(s)", terminator: "")
                // #region agent log
                logDebug(location: "BackendManager.swift:109", message: "Backend stderr", data: ["error": s], hypothesisId: "C,E")
                // #endregion
            }
        }

        p.terminationHandler = { [weak self] proc in
            // #region agent log
            logDebug(location: "BackendManager.swift:111", message: "Backend process terminated", data: ["exitCode": proc.terminationStatus, "reason": proc.terminationReason.rawValue], hypothesisId: "C")
            // #endregion
            
            DispatchQueue.main.async {
                guard let self else { return }

                let wasExpected = self.expectedTerminations.contains(token)
                if wasExpected {
                    self.expectedTerminations.remove(token)
                } else {
                    let code = proc.terminationStatus
                    if self.isReady {
                        self.lastError = "Backend stopped unexpectedly (code \(code))."
                    } else {
                        self.lastError = "Backend exited early (code \(code))."
                    }
                }

                self.isReady = false
                self.process = nil
                self.currentToken = nil
            }
        }

        try p.run()
        self.process = p
        
        // #region agent log
        logDebug(location: "BackendManager.swift:133", message: "Backend process started", data: ["pid": p.processIdentifier, "isRunning": p.isRunning], hypothesisId: "C")
        // #endregion
    }

    private func stopBackend(expected: Bool) {
        guard let p = process else { return }

        if expected, let token = currentToken {
            expectedTerminations.insert(token)
        }

        p.terminate()
        process = nil
        currentToken = nil
    }

    // MARK: - Health check

    private func waitForHealth(timeoutSeconds: TimeInterval) async -> Bool {
        let healthURL = URL(string: "http://\(host):\(port)/health")!
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        
        // #region agent log
        logDebug(location: "BackendManager.swift:152", message: "Starting health check", data: ["url": healthURL.absoluteString, "timeout": timeoutSeconds], hypothesisId: "F")
        // #endregion
        
        var attemptCount = 0
        while Date() < deadline {
            attemptCount += 1
            // If process died, stop waiting.
            if process == nil {
                // #region agent log
                logDebug(location: "BackendManager.swift:160", message: "Health check aborted - process died", data: ["attempts": attemptCount], hypothesisId: "C,F")
                // #endregion
                return false
            }

            do {
                var request = URLRequest(url: healthURL)
                request.timeoutInterval = 1.0
                let (_, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    // #region agent log
                    logDebug(location: "BackendManager.swift:170", message: "Health check succeeded", data: ["attempts": attemptCount, "statusCode": 200], hypothesisId: "F")
                    // #endregion
                    return true
                } else if let http = response as? HTTPURLResponse {
                    // #region agent log
                    logDebug(location: "BackendManager.swift:175", message: "Health check got non-200 response", data: ["attempts": attemptCount, "statusCode": http.statusCode], hypothesisId: "F")
                    // #endregion
                }
            } catch {
                // #region agent log
                if attemptCount % 5 == 0 {  // Log every 5th attempt to avoid spam
                    logDebug(location: "BackendManager.swift:181", message: "Health check failed", data: ["attempts": attemptCount, "error": error.localizedDescription], hypothesisId: "F")
                }
                // #endregion
            }

            try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
        }
        
        // #region agent log
        logDebug(location: "BackendManager.swift:189", message: "Health check timed out", data: ["totalAttempts": attemptCount, "timeout": timeoutSeconds], hypothesisId: "F")
        // #endregion

        return false
    }

    // MARK: - Bundle resolution

    private func resolveBackendExecutable() throws -> URL {
        // We copy PyInstaller one-folder output into:
        //   MyApp.app/Contents/Resources/backend_server/backend_server
        guard let resources = Bundle.main.resourceURL else {
            // #region agent log
            logDebug(location: "BackendManager.swift:182", message: "Missing Bundle resources URL", data: [:], hypothesisId: "A")
            // #endregion
            throw NSError(domain: "MacWrapper", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Missing Bundle resources URL"
            ])
        }

        let backendDir = resources.appendingPathComponent("backend_server", isDirectory: true)
        let exe = backendDir.appendingPathComponent("backend_server", isDirectory: false)
        
        // #region agent log
        let exists = FileManager.default.fileExists(atPath: exe.path)
        let isExec = FileManager.default.isExecutableFile(atPath: exe.path)
        logDebug(location: "BackendManager.swift:192", message: "Checking backend executable", data: ["path": exe.path, "exists": exists, "isExecutable": isExec, "resourcesURL": resources.path], hypothesisId: "A,B")
        // #endregion

        if FileManager.default.isExecutableFile(atPath: exe.path) {
            return exe
        }

        throw NSError(domain: "MacWrapper", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Backend executable not found at \(exe.path)"
        ])
    }

    // MARK: - Port selection

    private func pickAvailablePort() throws -> Int {
        // Bind to port 0 to let the OS choose a free ephemeral port, then close it and reuse.
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else {
            // #region agent log
            logDebug(location: "BackendManager.swift:205", message: "Socket creation failed", data: ["errno": errno], hypothesisId: "D")
            // #endregion
            throw errnoError("socket() failed")
        }
        defer { close(fd) }

        var addr = sockaddr_in()
        addr.sin_len = __uint8_t(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(0).bigEndian
        addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

        let bindResult = withUnsafePointer(to: &addr) { ptr -> Int32 in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            throw errnoError("bind() failed")
        }

        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        var outAddr = sockaddr_in()
        let nameResult = withUnsafeMutablePointer(to: &outAddr) { ptr -> Int32 in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.getsockname(fd, $0, &len)
            }
        }
        guard nameResult == 0 else {
            throw errnoError("getsockname() failed")
        }

        let chosenPort = Int(UInt16(bigEndian: outAddr.sin_port))
        guard chosenPort > 0 else {
            // #region agent log
            logDebug(location: "BackendManager.swift:238", message: "Invalid port selected", data: ["port": chosenPort], hypothesisId: "D")
            // #endregion
            throw NSError(domain: "MacWrapper", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "OS returned invalid port"
            ])
        }
        
        // #region agent log
        logDebug(location: "BackendManager.swift:243", message: "Port selected successfully", data: ["port": chosenPort], hypothesisId: "D")
        // #endregion
        
        return chosenPort
    }

    private func errnoError(_ message: String) -> NSError {
        let err = errno
        let desc = String(cString: strerror(err))
        return NSError(domain: "MacWrapper", code: Int(err), userInfo: [
            NSLocalizedDescriptionKey: "\(message): [\(err)] \(desc)"
        ])
    }
}

// #region agent log
func logDebug(location: String, message: String, data: [String: Any], hypothesisId: String) {
    let logPath = "/Users/Richard.Luo4/Developer/budget/.cursor/debug.log"
    let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
    let logEntry: [String: Any] = [
        "timestamp": timestamp,
        "location": location,
        "message": message,
        "data": data,
        "sessionId": "debug-session",
        "hypothesisId": hypothesisId
    ]
    if let jsonData = try? JSONSerialization.data(withJSONObject: logEntry, options: []),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        if let fileHandle = FileHandle(forWritingAtPath: logPath) {
            fileHandle.seekToEndOfFile()
            if let data = (jsonString + "\n").data(using: .utf8) {
                fileHandle.write(data)
            }
            fileHandle.closeFile()
        } else {
            try? (jsonString + "\n").write(toFile: logPath, atomically: true, encoding: .utf8)
        }
    }
}
// #endregion
