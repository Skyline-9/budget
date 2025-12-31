use std::env;
use std::fs;
use std::fs::File;
use std::io;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

type BoxError = Box<dyn std::error::Error + Send + Sync + 'static>;
type Result<T> = std::result::Result<T, BoxError>;

fn main() {
    if let Err(e) = run() {
        eprintln!("ERROR: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse(env::args().skip(1).collect())?;

    if let CliCommand::FlattenIcon { input, output } = cli.command {
        flatten_icon_to_opaque_png(&input, &output)?;
        return Ok(());
    }

    let mut cfg = Config::from_env();
    let ansi = Ansi::new();

    if cfg.dev_mode {
        log_line(&ansi, AnsiColor::Blue, "==> Development mode: fast frontend-only updates");
        cfg.skip_backend = true;
        cfg.skip_swift = true;
        cfg.codesign_identity.clear();
    }

    let root = if let Some(root) = cli.root_override {
        root
    } else {
        find_repo_root()?
    };

    build(&ansi, &cfg, &root)
}

// ----------------------------
// CLI + Config
// ----------------------------

#[derive(Debug, Clone)]
struct Cli {
    root_override: Option<PathBuf>,
    command: CliCommand,
}

#[derive(Debug, Clone)]
enum CliCommand {
    Build,
    FlattenIcon { input: PathBuf, output: PathBuf },
}

impl Cli {
    fn parse(args: Vec<String>) -> Result<Self> {
        if args.iter().any(|a| a == "--help" || a == "-h") {
            print_help();
            std::process::exit(0);
        }

        // Subcommand: flatten-icon <input> <output>
        if let Some(first) = args.first() {
            if first == "flatten-icon" {
                if args.len() != 3 {
                    return Err("Usage: build_mac_app flatten-icon <input.png> <output.png>".into());
                }
                return Ok(Self {
                    root_override: None,
                    command: CliCommand::FlattenIcon {
                        input: PathBuf::from(&args[1]),
                        output: PathBuf::from(&args[2]),
                    },
                });
            }
        }

        // Parse flags (currently only --root <path>)
        let mut root_override: Option<PathBuf> = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--root" => {
                    let Some(val) = args.get(i + 1) else {
                        return Err("--root requires a value".into());
                    };
                    root_override = Some(PathBuf::from(val));
                    i += 2;
                }
                _ => {
                    // Unknown args are ignored for now (env vars are the primary interface).
                    i += 1;
                }
            }
        }

        Ok(Self {
            root_override,
            command: CliCommand::Build,
        })
    }
}

fn print_help() {
    println!(
        r#"build_mac_app (Rust)

Builds the macOS .app bundle (frontend + backend + Swift wrapper) using env vars (same as the old bash script).

Usage:
  build_mac_app [--root <repo_root>]
  build_mac_app flatten-icon <input.png> <output.png>

Common env vars:
  CLEAN=1               Full rebuild (clears .mac_build and dist/<App>.app)
  FORCE_FRONTEND=1      Force frontend rebuild
  FORCE_BACKEND=1       Force backend (PyInstaller) rebuild
  FORCE_SWIFT=1         Force Swift rebuild (SwiftPM is incremental anyway)

  SKIP_FRONTEND=1       Skip frontend steps
  SKIP_BACKEND=1        Skip backend steps
  SKIP_SWIFT=1          Skip Swift build step

  DEV_MODE=1            Fast frontend-only updates (implies SKIP_BACKEND=1 SKIP_SWIFT=1)
  VERBOSE=1             Verbose logging
  DRY_RUN=1             Plan mode (prints actions, does not execute)

  APP_NAME=Budget
  BUNDLE_ID=com.budget.app
  APP_VERSION=0.1.0
  BUILD_NUMBER=1

  CODESIGN_IDENTITY=... Optional codesign identity (enables codesign)
"#
    );
}

#[derive(Debug, Clone)]
struct Config {
    app_name: String,
    bundle_id: String,
    app_version: String,
    build_number: String,

    clean: bool,
    force_frontend: bool,
    force_backend: bool,
    force_swift: bool,

    skip_frontend: bool,
    skip_backend: bool,
    skip_swift: bool,

    dev_mode: bool,
    verbose: bool,
    dry_run: bool,

    codesign_identity: String,
}

impl Config {
    fn from_env() -> Self {
        Self {
            app_name: env_string("APP_NAME", "Budget"),
            bundle_id: env_string("BUNDLE_ID", "com.budget.app"),
            app_version: env_string("APP_VERSION", "0.1.0"),
            build_number: env_string("BUILD_NUMBER", "1"),

            clean: env_bool("CLEAN", false),
            force_frontend: env_bool("FORCE_FRONTEND", false),
            force_backend: env_bool("FORCE_BACKEND", false),
            force_swift: env_bool("FORCE_SWIFT", false),

            skip_frontend: env_bool("SKIP_FRONTEND", false),
            skip_backend: env_bool("SKIP_BACKEND", false),
            skip_swift: env_bool("SKIP_SWIFT", false),

            dev_mode: env_bool("DEV_MODE", false),
            verbose: env_bool("VERBOSE", false),
            dry_run: env_bool("DRY_RUN", false),

            codesign_identity: env_string("CODESIGN_IDENTITY", ""),
        }
    }
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_bool(key: &str, default: bool) -> bool {
    match env::var(key) {
        Ok(v) => v == "1" || v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("yes"),
        Err(_) => default,
    }
}

// ----------------------------
// Logging helpers
// ----------------------------

#[derive(Clone, Copy)]
enum AnsiColor {
    Red,
    Green,
    Yellow,
    Blue,
}

struct Ansi {
    enabled: bool,
}

impl Ansi {
    fn new() -> Self {
        Self {
            enabled: io::stdout().is_terminal(),
        }
    }

    fn code(&self, color: AnsiColor) -> &'static str {
        if !self.enabled {
            return "";
        }
        match color {
            AnsiColor::Red => "\x1b[0;31m",
            AnsiColor::Green => "\x1b[0;32m",
            AnsiColor::Yellow => "\x1b[1;33m",
            AnsiColor::Blue => "\x1b[0;34m",
        }
    }

    fn bold(&self) -> &'static str {
        if self.enabled { "\x1b[1m" } else { "" }
    }

    fn reset(&self) -> &'static str {
        if self.enabled { "\x1b[0m" } else { "" }
    }
}

fn log_line(ansi: &Ansi, color: AnsiColor, msg: &str) {
    println!("{}{}{}", ansi.code(color), msg, ansi.reset());
}

fn log_verbose(ansi: &Ansi, cfg: &Config, msg: &str) {
    if cfg.verbose {
        println!("{}[VERBOSE]{} {}", ansi.code(AnsiColor::Blue), ansi.reset(), msg);
    }
}

fn log_warn(ansi: &Ansi, msg: &str) {
    println!("{}⚠️  {}{}", ansi.code(AnsiColor::Yellow), msg, ansi.reset());
}

// ----------------------------
// Repo root resolution
// ----------------------------

fn looks_like_repo_root(dir: &Path) -> bool {
    dir.join("webapp").is_dir() && dir.join("backend").is_dir() && dir.join("macos-app").is_dir()
}

fn find_repo_root() -> Result<PathBuf> {
    let cwd = env::current_dir()?;
    if looks_like_repo_root(&cwd) {
        return Ok(cwd);
    }

    let exe = env::current_exe().ok();
    if let Some(exe) = exe {
        let mut cur = exe.parent().map(Path::to_path_buf);
        while let Some(dir) = cur {
            if looks_like_repo_root(&dir) {
                return Ok(dir);
            }
            cur = dir.parent().map(Path::to_path_buf);
        }
    }

    // Compile-time fallback (works well in dev)
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut cur = Some(manifest_dir);
    while let Some(dir) = cur {
        if looks_like_repo_root(&dir) {
            return Ok(dir);
        }
        cur = dir.parent().map(Path::to_path_buf);
    }

    Err("Could not locate repo root. Run from the repo root or pass --root <path>.".into())
}

// ----------------------------
// Build pipeline
// ----------------------------

#[derive(Debug)]
enum TaskKind {
    FrontendBuild {
        env_file: PathBuf,
        stamp_file: PathBuf,
        env_content: String,
    },
    BackendBuild { stamp_file: PathBuf },
    SwiftBuild,
}

#[derive(Debug)]
struct Task {
    name: &'static str,
    child: Child,
    kind: TaskKind,
}

fn build(ansi: &Ansi, cfg: &Config, root: &Path) -> Result<()> {
    let start = Instant::now();

    log_line(ansi, AnsiColor::Green, "==> Checking toolchain...");
    require_cmd(ansi, cfg, "npm", Some("brew install node"))?;
    require_cmd(ansi, cfg, "node", Some("brew install node"))?;
    require_cmd(ansi, cfg, "uv", Some("brew install uv"))?;
    require_cmd(ansi, cfg, "swift", Some("(Xcode should provide this)"))?;
    require_cmd(ansi, cfg, "xcrun", Some("(Xcode should provide this)"))?;
    require_cmd(ansi, cfg, "rsync", Some("brew install rsync"))?;

    // Common macOS tools used later (warn-only: they might not be needed depending on steps)
    warn_if_missing(ansi, cfg, "sips")?;
    warn_if_missing(ansi, cfg, "iconutil")?;

    let out_dir = root.join("dist");
    let work_dir = root.join(".mac_build");
    let stamps_dir = work_dir.join("stamps");
    let backend_out = work_dir.join("backend_dist");
    let app_bundle = out_dir.join(format!("{}.app", cfg.app_name));

    let webapp_dir = root.join("webapp");
    let backend_dir = root.join("backend");
    let wrapper_dir = root.join("macos-app");
    let wrapper_bin = wrapper_dir.join(".build").join("release").join("MacWrapper");

    if cfg.clean {
        log_line(
            ansi,
            AnsiColor::Yellow,
            "==> CLEAN=1: clearing build cache + output app bundle",
        );
        if cfg.dry_run {
            println!("{}[DRY RUN]{} rm -rf {} {}", ansi.code(AnsiColor::Yellow), ansi.reset(), work_dir.display(), app_bundle.display());
        } else {
            let _ = fs::remove_dir_all(&work_dir);
            let _ = fs::remove_dir_all(&app_bundle);
        }
    }

    if !cfg.dry_run {
        fs::create_dir_all(&out_dir)?;
        fs::create_dir_all(&work_dir)?;
        fs::create_dir_all(&stamps_dir)?;
        fs::create_dir_all(&backend_out)?;
    }

    // ----------------------------
    // 1) Frontend deps
    // ----------------------------
    let webapp_deps_stamp = stamps_dir.join("webapp_deps.stamp");
    let lock_file = {
        let p = webapp_dir.join("package-lock.json");
        if p.is_file() { Some(p) } else { None }
    };

    if !cfg.skip_frontend {
        let need_npm_install = {
            let mut need = false;
            if !webapp_dir.join("node_modules").is_dir() {
                need = true;
                log_verbose(ansi, cfg, "node_modules missing");
            }
            if !webapp_deps_stamp.is_file() {
                need = true;
                log_verbose(ansi, cfg, "webapp deps stamp missing");
            }
            if file_newer_than(&webapp_dir.join("package.json"), &webapp_deps_stamp)? {
                need = true;
                log_verbose(ansi, cfg, "package.json changed");
            }
            if let Some(lock) = &lock_file {
                if file_newer_than(lock, &webapp_deps_stamp)? {
                    need = true;
                    log_verbose(ansi, cfg, "package-lock.json changed");
                }
            }
            need
        };

        if need_npm_install || cfg.force_frontend {
            log_line(ansi, AnsiColor::Green, "==> Installing frontend dependencies...");
            if let Some(_lock) = &lock_file {
                run_cmd(
                    ansi,
                    cfg,
                    Some(&webapp_dir),
                    "npm",
                    &["ci", "--no-audit", "--fund=false"],
                    &[],
                )?;
            } else {
                run_cmd(
                    ansi,
                    cfg,
                    Some(&webapp_dir),
                    "npm",
                    &["install", "--no-audit", "--fund=false"],
                    &[],
                )?;
            }
            write_stamp(cfg, &webapp_deps_stamp)?;
        } else {
            log_line(ansi, AnsiColor::Blue, "==> Frontend deps unchanged; skipping npm install");
        }
    } else {
        log_line(ansi, AnsiColor::Blue, "==> Skipping frontend deps");
    }

    // ----------------------------
    // 1b) Frontend build
    // ----------------------------
    let webapp_build_stamp = stamps_dir.join("webapp_build.stamp");
    let webapp_build_env_file = stamps_dir.join("webapp_build.env");
    let webapp_build_env_content = "VITE_API_MODE=real\nVITE_API_BASE_URL=\n".to_string();

    let mut tasks: Vec<Task> = Vec::new();

    if !cfg.skip_frontend {
        let need_webapp_build = compute_need_webapp_build(
            ansi,
            cfg,
            &webapp_dir,
            &webapp_build_stamp,
            &webapp_build_env_file,
            &webapp_build_env_content,
            lock_file.as_ref(),
        )?;

        if need_webapp_build || cfg.force_frontend {
            log_line(ansi, AnsiColor::Green, "==> Building frontend (webapp/dist)...");
            if cfg.dry_run {
                run_cmd(
                    ansi,
                    cfg,
                    Some(&webapp_dir),
                    "npm",
                    &["run", "build"],
                    &[("VITE_API_MODE", "real"), ("VITE_API_BASE_URL", "")],
                )?;
            } else {
                let child = spawn_cmd(
                    ansi,
                    cfg,
                    Some(&webapp_dir),
                    "npm",
                    &["run", "build"],
                    &[("VITE_API_MODE", "real"), ("VITE_API_BASE_URL", "")],
                )?;
                tasks.push(Task {
                    name: "frontend build",
                    child,
                    kind: TaskKind::FrontendBuild {
                        env_file: webapp_build_env_file.clone(),
                        stamp_file: webapp_build_stamp.clone(),
                        env_content: webapp_build_env_content.clone(),
                    },
                });
            }
        } else {
            log_line(ansi, AnsiColor::Blue, "==> Frontend unchanged; skipping vite build");
        }
    }

    // ----------------------------
    // 2) Backend deps
    // ----------------------------
    let backend_deps_stamp = stamps_dir.join("backend_deps.stamp");
    let backend_lock_file = backend_dir.join("uv.lock");

    if !cfg.skip_backend {
        let need_uv_sync = {
            let mut need = false;
            if !backend_dir.join(".venv").is_dir() {
                need = true;
                log_verbose(ansi, cfg, ".venv missing");
            }
            if !backend_deps_stamp.is_file() {
                need = true;
                log_verbose(ansi, cfg, "backend deps stamp missing");
            }
            if file_newer_than(&backend_dir.join("pyproject.toml"), &backend_deps_stamp)? {
                need = true;
                log_verbose(ansi, cfg, "pyproject.toml changed");
            }
            if backend_lock_file.is_file() && file_newer_than(&backend_lock_file, &backend_deps_stamp)? {
                need = true;
                log_verbose(ansi, cfg, "uv.lock changed");
            }
            need
        };

        if need_uv_sync || cfg.force_backend {
            log_line(ansi, AnsiColor::Green, "==> Syncing backend dependencies (uv)...");
            if backend_lock_file.is_file() {
                run_cmd(ansi, cfg, Some(&backend_dir), "uv", &["sync", "--frozen"], &[])?;
            } else {
                run_cmd(ansi, cfg, Some(&backend_dir), "uv", &["sync"], &[])?;
            }
            write_stamp(cfg, &backend_deps_stamp)?;
        } else {
            log_line(ansi, AnsiColor::Blue, "==> Backend deps unchanged; skipping uv sync");
        }
    } else {
        log_line(ansi, AnsiColor::Blue, "==> Skipping backend deps");
    }

    // ----------------------------
    // 2b) Backend build (PyInstaller)
    //     SPEED OPTIMIZATIONS:
    //       - No --clean flag: keeps PyInstaller's analysis cache (~80% speedup on repeat builds)
    //       - --noupx: skips UPX compression (faster, macOS compresses anyway)
    //       - --log-level ERROR: reduces I/O overhead from verbose logging
    //       - --exclude-module: drops heavy stdlib modules that FastAPI doesn't need
    // ----------------------------
    let backend_build_stamp = stamps_dir.join("backend_build.stamp");
    let backend_product_dir = backend_out.join("backend_server");

    if !cfg.skip_backend {
        let need_pyinstall = compute_need_backend_pyinstaller(
            ansi,
            cfg,
            &backend_dir,
            &backend_product_dir,
            &backend_build_stamp,
            &backend_deps_stamp,
        )?;

        if need_pyinstall || cfg.force_backend {
            log_line(ansi, AnsiColor::Green, "==> Building backend executable with PyInstaller...");
            let args: Vec<String> = vec![
                "run".into(),
                "--with".into(),
                "pyinstaller".into(),
                "--".into(),
                "pyinstaller".into(),
                "--noconfirm".into(),
                "--noupx".into(),  // Skip UPX compression (faster builds, modern macOS already compresses)
                "--log-level".into(),
                "ERROR".into(),  // Reduce log output (faster I/O)
                "--name".into(),
                "backend_server".into(),
                "--distpath".into(),
                backend_out.to_string_lossy().to_string(),
                "--workpath".into(),
                work_dir.join("backend_work").to_string_lossy().to_string(),
                "--specpath".into(),
                work_dir.join("backend_spec").to_string_lossy().to_string(),
                // Collect required packages
                "--collect-all".into(),
                "uvicorn".into(),
                "--collect-all".into(),
                "fastapi".into(),
                "--collect-all".into(),
                "starlette".into(),
                // Exclude heavy stdlib modules that FastAPI doesn't need
                "--exclude-module".into(),
                "tkinter".into(),
                "--exclude-module".into(),
                "matplotlib".into(),
                "--exclude-module".into(),
                "PyQt5".into(),
                "--exclude-module".into(),
                "PyQt6".into(),
                "--exclude-module".into(),
                "PySide2".into(),
                "--exclude-module".into(),
                "PySide6".into(),
                "--exclude-module".into(),
                "numpy.distutils".into(),
                "--exclude-module".into(),
                "setuptools".into(),
                "--exclude-module".into(),
                "distutils".into(),
                "--exclude-module".into(),
                "test".into(),
                "--exclude-module".into(),
                "unittest".into(),
                "--exclude-module".into(),
                "pytest".into(),
                "macapp_entry.py".into(),
            ];
            let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

            if cfg.dry_run {
                run_cmd(ansi, cfg, Some(&backend_dir), "uv", &args_ref, &[])?;
            } else {
                let child = spawn_cmd(ansi, cfg, Some(&backend_dir), "uv", &args_ref, &[])?;
                tasks.push(Task {
                    name: "backend build",
                    child,
                    kind: TaskKind::BackendBuild {
                        stamp_file: backend_build_stamp.clone(),
                    },
                });
            }
        } else {
            log_line(ansi, AnsiColor::Blue, "==> Backend unchanged; skipping PyInstaller");
        }
    }

    // ----------------------------
    // 3) Swift wrapper build
    // ----------------------------
    if !cfg.skip_swift {
        log_line(ansi, AnsiColor::Green, "==> Building Swift wrapper...");
        let swift_home = work_dir.join("swift_home");
        if !cfg.dry_run {
            fs::create_dir_all(&swift_home)?;
        }

        // SwiftPM is incremental; FORCE_SWIFT still runs the command (no extra flag needed).
        if cfg.force_swift {
            log_verbose(ansi, cfg, "FORCE_SWIFT=1 (SwiftPM will still be incremental)");
        }

        let home = swift_home.to_string_lossy().to_string();
        if cfg.dry_run {
            run_cmd(
                ansi,
                cfg,
                Some(&wrapper_dir),
                "swift",
                &["build", "-c", "release", "--disable-sandbox"],
                &[("HOME", home.as_str())],
            )?;
        } else {
            let child = spawn_cmd_with_env(
                ansi,
                cfg,
                Some(&wrapper_dir),
                "swift",
                &["build", "-c", "release", "--disable-sandbox"],
                &[("HOME", home.as_str())],
            )?;
            tasks.push(Task {
                name: "swift build",
                child,
                kind: TaskKind::SwiftBuild,
            });
        }
    } else {
        log_line(ansi, AnsiColor::Blue, "==> Skipping Swift build");
    }

    // ----------------------------
    // DRY_RUN: only plan mode
    // ----------------------------
    if cfg.dry_run {
        log_line(ansi, AnsiColor::Yellow, "==> DRY_RUN=1: plan complete (no commands executed)");
        return Ok(());
    }

    // ----------------------------
    // Wait for background tasks
    // ----------------------------
    for mut task in tasks {
        log_line(
            ansi,
            AnsiColor::Blue,
            &format!("==> Waiting for {}...", task.name),
        );
        let status = task.child.wait()?;
        if !status.success() {
            return Err(format!("Task failed ({}): {}", task.name, status).into());
        }

        match task.kind {
            TaskKind::FrontendBuild {
                env_file,
                stamp_file,
                env_content,
            } => {
                fs::write(env_file, env_content)?;
                write_stamp(cfg, &stamp_file)?;
                log_line(ansi, AnsiColor::Green, "✓ Frontend build completed");
            }
            TaskKind::BackendBuild { stamp_file } => {
                write_stamp(cfg, &stamp_file)?;
                log_line(ansi, AnsiColor::Green, "✓ Backend build completed");
            }
            TaskKind::SwiftBuild => {
                log_line(ansi, AnsiColor::Green, "✓ Swift build completed");
            }
        }
    }

    if !wrapper_bin.is_file() {
        return Err(format!(
            "Wrapper binary not found at {} (did swift build succeed?)",
            wrapper_bin.display()
        )
        .into());
    }

    // ----------------------------
    // 4) Assemble .app bundle
    // ----------------------------
    log_line(
        ansi,
        AnsiColor::Green,
        &format!("==> Assembling app bundle: {}{}", ansi.bold(), app_bundle.display()),
    );
    fs::create_dir_all(app_bundle.join("Contents").join("MacOS"))?;
    fs::create_dir_all(app_bundle.join("Contents").join("Resources"))?;

    // Copy wrapper executable -> Contents/MacOS/<APP_NAME>
    let wrapper_dest = app_bundle.join("Contents").join("MacOS").join(&cfg.app_name);
    copy_executable(&wrapper_bin, &wrapper_dest)?;

    // Copy backend one-folder dist -> Resources/backend_server
    if !backend_product_dir.is_dir() {
        return Err(format!(
            "Backend build output not found at {}",
            backend_product_dir.display()
        )
        .into());
    }
    let backend_target = app_bundle.join("Contents").join("Resources").join("backend_server");
    fs::create_dir_all(&backend_target)?;
    run_cmd(
        ansi,
        cfg,
        None,
        "rsync",
        &[
            "-a",
            "--delete",
            format!("{}/", backend_product_dir.display()).as_str(),
            format!("{}/", backend_target.display()).as_str(),
        ],
        &[],
    )?;

    // Copy frontend dist -> Resources/backend_server/webapp_dist
    let webapp_dist = webapp_dir.join("dist");
    if !webapp_dist.is_dir() {
        return Err(format!("Frontend dist not found at {}", webapp_dist.display()).into());
    }
    let webapp_target = backend_target.join("webapp_dist");
    fs::create_dir_all(&webapp_target)?;
    run_cmd(
        ansi,
        cfg,
        None,
        "rsync",
        &[
            "-a",
            "--delete",
            format!("{}/", webapp_dist.display()).as_str(),
            format!("{}/", webapp_target.display()).as_str(),
        ],
        &[],
    )?;

    // ----------------------------
    // 4.5) App icon (.icns) + Info.plist
    // ----------------------------
    let has_icon = build_app_icon(ansi, cfg, root, &work_dir, &app_bundle)?;
    write_info_plist(cfg, &app_bundle, has_icon)?;
    write_pkg_info(&app_bundle)?;

    // Touch app bundle (helps macOS notice icon changes)
    let _ = Command::new("touch").arg(&app_bundle).status();

    // ----------------------------
    // 5) Optional codesign
    // ----------------------------
    if !cfg.codesign_identity.trim().is_empty() {
        log_line(
            ansi,
            AnsiColor::Green,
            &format!("==> Codesigning (identity: {})", cfg.codesign_identity),
        );
        run_cmd(
            ansi,
            cfg,
            None,
            "codesign",
            &[
                "--force",
                "--deep",
                "--options",
                "runtime",
                "--sign",
                cfg.codesign_identity.as_str(),
                app_bundle.to_string_lossy().as_ref(),
            ],
            &[],
        )?;
    } else {
        log_line(ansi, AnsiColor::Blue, "==> Skipping codesign (set CODESIGN_IDENTITY to enable)");
    }

    // ----------------------------
    // Done
    // ----------------------------
    let elapsed = start.elapsed();
    println!();
    println!(
        "{}{}✅ Build complete in {}s{}",
        ansi.code(AnsiColor::Green),
        ansi.bold(),
        elapsed.as_secs(),
        ansi.reset()
    );
    println!("{}App:{} {}", ansi.bold(), ansi.reset(), app_bundle.display());
    println!();
    println!("{}Run:{} open \"{}\"", ansi.bold(), ansi.reset(), app_bundle.display());

    Ok(())
}

fn require_cmd(ansi: &Ansi, cfg: &Config, cmd: &str, install_hint: Option<&str>) -> Result<()> {
    if which_in_path(cmd).is_none() {
        eprintln!("{}ERROR:{} Missing required command: {}", ansi.code(AnsiColor::Red), ansi.reset(), cmd);
        if let Some(hint) = install_hint {
            eprintln!("{}Install via:{} {}", ansi.code(AnsiColor::Yellow), ansi.reset(), hint);
        }
        return Err(format!("Missing required command: {cmd}").into());
    }
    if cfg.verbose {
        if let Some(p) = which_in_path(cmd) {
            log_verbose(ansi, cfg, &format!("Found {}: {}", cmd, p.display()));
        }
    }
    Ok(())
}

fn warn_if_missing(ansi: &Ansi, cfg: &Config, cmd: &str) -> Result<()> {
    if which_in_path(cmd).is_none() {
        log_verbose(ansi, cfg, &format!("Optional command not found: {}", cmd));
    }
    Ok(())
}

fn which_in_path(cmd: &str) -> Option<PathBuf> {
    // If already a path
    if cmd.contains('/') {
        let p = PathBuf::from(cmd);
        return if p.is_file() { Some(p) } else { None };
    }

    let path = env::var_os("PATH")?;
    for dir in env::split_paths(&path) {
        let candidate = dir.join(cmd);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn run_cmd(
    ansi: &Ansi,
    cfg: &Config,
    cwd: Option<&Path>,
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Result<()> {
    if cfg.dry_run {
        let cwd_str = cwd.map(|p| p.to_string_lossy()).unwrap_or_else(|| "".into());
        let prefix = if cwd_str.is_empty() {
            "".to_string()
        } else {
            format!("(cd {}) ", cwd_str)
        };
        println!(
            "{}[DRY RUN]{} {}{} {}",
            ansi.code(AnsiColor::Yellow),
            ansi.reset(),
            prefix,
            program,
            args.join(" ")
        );
        if cfg.verbose && !envs.is_empty() {
            for (k, v) in envs {
                println!(
                    "{}[VERBOSE]{} env {}={}",
                    ansi.code(AnsiColor::Blue),
                    ansi.reset(),
                    k,
                    v
                );
            }
        }
        return Ok(());
    }

    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    for (k, v) in envs {
        cmd.env(k, v);
    }
    cmd.stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    log_verbose(
        ansi,
        cfg,
        &format!(
            "Running: {} {}",
            program,
            args.join(" ")
        ),
    );

    let status = cmd.status()?;
    if !status.success() {
        return Err(format!("Command failed: {} {}", program, args.join(" ")).into());
    }
    Ok(())
}

fn spawn_cmd(
    ansi: &Ansi,
    cfg: &Config,
    cwd: Option<&Path>,
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Result<Child> {
    spawn_cmd_with_env(ansi, cfg, cwd, program, args, envs)
}

fn spawn_cmd_with_env(
    ansi: &Ansi,
    cfg: &Config,
    cwd: Option<&Path>,
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Result<Child> {
    if cfg.dry_run {
        let cwd_str = cwd.map(|p| p.to_string_lossy()).unwrap_or_else(|| "".into());
        let prefix = if cwd_str.is_empty() {
            "".to_string()
        } else {
            format!("(cd {}) ", cwd_str)
        };
        println!(
            "{}[DRY RUN]{} spawn {}{} {}",
            ansi.code(AnsiColor::Yellow),
            ansi.reset(),
            prefix,
            program,
            args.join(" ")
        );
        if cfg.verbose && !envs.is_empty() {
            for (k, v) in envs {
                println!(
                    "{}[VERBOSE]{} env {}={}",
                    ansi.code(AnsiColor::Blue),
                    ansi.reset(),
                    k,
                    v
                );
            }
        }
        return Err("DRY_RUN=1: spawn_cmd called unexpectedly".into());
    }

    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    for (k, v) in envs {
        cmd.env(k, v);
    }
    cmd.stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    log_verbose(
        ansi,
        cfg,
        &format!("Spawning: {} {}", program, args.join(" ")),
    );

    Ok(cmd.spawn()?)
}

fn write_stamp(cfg: &Config, stamp: &Path) -> Result<()> {
    if cfg.dry_run {
        return Ok(());
    }
    if let Some(parent) = stamp.parent() {
        fs::create_dir_all(parent)?;
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    fs::write(stamp, format!("{now}\n"))?;
    Ok(())
}

fn file_newer_than(file: &Path, stamp: &Path) -> Result<bool> {
    if !file.is_file() {
        return Ok(false);
    }
    if !stamp.is_file() {
        return Ok(true);
    }
    let f = file.metadata()?.modified()?;
    let s = stamp.metadata()?.modified()?;
    Ok(f > s)
}

fn dir_has_newer_than(dir: &Path, stamp: &Path) -> Result<bool> {
    if !dir.is_dir() {
        return Ok(false);
    }
    if !stamp.is_file() {
        return Ok(true);
    }
    let stamp_time = stamp.metadata()?.modified()?;

    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in fs::read_dir(&d)? {
            let entry = entry?;
            let ft = entry.file_type()?;
            let path = entry.path();
            if ft.is_dir() {
                stack.push(path);
            } else if ft.is_file() {
                let m = entry.metadata()?.modified()?;
                if m > stamp_time {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn compute_need_webapp_build(
    ansi: &Ansi,
    cfg: &Config,
    webapp_dir: &Path,
    build_stamp: &Path,
    build_env_file: &Path,
    build_env_content: &str,
    lock_file: Option<&PathBuf>,
) -> Result<bool> {
    if !webapp_dir.join("dist").is_dir() {
        log_verbose(ansi, cfg, "webapp/dist missing");
        return Ok(true);
    }
    if !build_stamp.is_file() {
        log_verbose(ansi, cfg, "webapp build stamp missing");
        return Ok(true);
    }
    if !build_env_file.is_file() {
        log_verbose(ansi, cfg, "webapp build env file missing");
        return Ok(true);
    }
    if let Ok(existing) = fs::read_to_string(build_env_file) {
        if existing != build_env_content {
            log_verbose(ansi, cfg, "webapp build env content changed");
            return Ok(true);
        }
    } else {
        log_verbose(ansi, cfg, "webapp build env unreadable");
        return Ok(true);
    }
    if file_newer_than(&webapp_dir.join("package.json"), build_stamp)? {
        return Ok(true);
    }
    if let Some(lock) = lock_file {
        if file_newer_than(lock, build_stamp)? {
            return Ok(true);
        }
    }
    if file_newer_than(&webapp_dir.join("index.html"), build_stamp)? {
        return Ok(true);
    }
    if dir_has_newer_than(&webapp_dir.join("src"), build_stamp)? {
        return Ok(true);
    }
    if dir_has_newer_than(&webapp_dir.join("public"), build_stamp)? {
        return Ok(true);
    }

    // Vite config could be js/ts; check common names
    for cfg_path in [
        webapp_dir.join("vite.config.ts"),
        webapp_dir.join("vite.config.js"),
        webapp_dir.join("vite.config.mts"),
        webapp_dir.join("vite.config.mjs"),
    ] {
        if cfg_path.is_file() && file_newer_than(&cfg_path, build_stamp)? {
            log_verbose(
                ansi,
                cfg,
                &format!("Vite config changed: {}", cfg_path.display()),
            );
            return Ok(true);
        }
    }

    Ok(false)
}

fn compute_need_backend_pyinstaller(
    ansi: &Ansi,
    cfg: &Config,
    backend_dir: &Path,
    backend_product_dir: &Path,
    build_stamp: &Path,
    deps_stamp: &Path,
) -> Result<bool> {
    if !backend_product_dir.is_dir() {
        log_verbose(ansi, cfg, "backend product dir missing");
        return Ok(true);
    }
    if !build_stamp.is_file() {
        log_verbose(ansi, cfg, "backend build stamp missing");
        return Ok(true);
    }
    if deps_stamp.is_file() && deps_stamp.metadata()?.modified()? > build_stamp.metadata()?.modified()? {
        log_verbose(ansi, cfg, "backend deps newer than build stamp");
        return Ok(true);
    }
    if file_newer_than(&backend_dir.join("macapp_entry.py"), build_stamp)? {
        log_verbose(ansi, cfg, "macapp_entry.py changed");
        return Ok(true);
    }
    if dir_has_newer_than(&backend_dir.join("app"), build_stamp)? {
        log_verbose(ansi, cfg, "backend app/ changed");
        return Ok(true);
    }
    Ok(false)
}

fn copy_executable(src: &Path, dest: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dest)?;
    let mut perms = dest.metadata()?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(dest, perms)?;
    Ok(())
}

// ----------------------------
// Icon building + Info.plist
// ----------------------------

fn build_app_icon(ansi: &Ansi, cfg: &Config, root: &Path, work_dir: &Path, app_bundle: &Path) -> Result<bool> {
    let icon_source = root.join("webapp").join("public").join("favicon");
    let icon_work = work_dir.join("appicon.iconset");
    let icon_out = app_bundle
        .join("Contents")
        .join("Resources")
        .join("appicon.icns");

    if !icon_source.is_dir() {
        log_warn(ansi, &format!("Icon source directory not found: {}", icon_source.display()));
        return Ok(false);
    }

    log_line(ansi, AnsiColor::Green, "==> Creating app icon...");

    let mut icon_src_file: Option<PathBuf> = None;
    for candidate in [
        icon_source.join("favicon-512.png"),
        icon_source.join("apple-touch-icon.png"),
        icon_source.join("favicon-256.png"),
    ] {
        if candidate.is_file() {
            icon_src_file = Some(candidate);
            break;
        }
    }

    let Some(icon_src_file) = icon_src_file else {
        log_warn(ansi, &format!("No suitable icon source file found in {}", icon_source.display()));
        return Ok(false);
    };

    println!("  Using {} as source", icon_src_file.file_name().unwrap_or_default().to_string_lossy());

    // Flatten alpha -> opaque PNG so macOS doesn't show halos in Finder/Dock.
    let icon_src_flat = work_dir.join("appicon_source_macos.png");
    flatten_icon_to_opaque_png(&icon_src_file, &icon_src_flat)?;
    let icon_src_for_mac = icon_src_flat;

    // Recreate iconset dir
    let _ = fs::remove_dir_all(&icon_work);
    fs::create_dir_all(&icon_work)?;

    println!("  Generating icon sizes...");
    let sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ];

    for (size, name) in sizes {
        let out = icon_work.join(name);
        run_cmd(
            ansi,
            cfg,
            None,
            "sips",
            &[
                "-z",
                size.to_string().as_str(),
                size.to_string().as_str(),
                icon_src_for_mac.to_string_lossy().as_ref(),
                "--out",
                out.to_string_lossy().as_ref(),
            ],
            &[],
        )?;
    }

    // Convert iconset -> icns
    let _ = fs::remove_file(&icon_out);

    let mut has_icon = false;
    if which_in_path("iconutil").is_some() {
        println!("  Converting to .icns format (iconutil)...");
        let _ = Command::new("iconutil")
            .args(["-c", "icns", icon_work.to_string_lossy().as_ref(), "-o", icon_out.to_string_lossy().as_ref()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    if icon_out.is_file() && icon_out.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        has_icon = true;
    } else {
        println!("  Converting to .icns format (sips fallback)...");
        let _ = Command::new("sips")
            .args([
                "-s",
                "format",
                "icns",
                icon_src_for_mac.to_string_lossy().as_ref(),
                "--out",
                icon_out.to_string_lossy().as_ref(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if icon_out.is_file() && icon_out.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
            has_icon = true;
        }
    }

    if has_icon {
        println!("✅ Icon ready: {}", icon_out.display());
    } else {
        log_warn(ansi, &format!("Failed to generate {}", icon_out.display()));
    }

    Ok(has_icon)
}

fn write_info_plist(cfg: &Config, app_bundle: &Path, has_icon: bool) -> Result<()> {
    let plist_path = app_bundle.join("Contents").join("Info.plist");
    let icon_key = if has_icon {
        "  <key>CFBundleIconFile</key>\n  <string>appicon</string>\n"
    } else {
        ""
    };

    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>{app_name}</string>
  <key>CFBundleDisplayName</key>
  <string>{app_name}</string>
  <key>CFBundleIdentifier</key>
  <string>{bundle_id}</string>
  <key>CFBundleExecutable</key>
  <string>{app_name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>{app_version}</string>
  <key>CFBundleVersion</key>
  <string>{build_number}</string>
{icon_key}
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSHighResolutionCapable</key>
  <true/>

  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
"#,
        app_name = cfg.app_name,
        bundle_id = cfg.bundle_id,
        app_version = cfg.app_version,
        build_number = cfg.build_number,
        icon_key = icon_key
    );

    fs::write(plist_path, plist)?;
    Ok(())
}

fn write_pkg_info(app_bundle: &Path) -> Result<()> {
    let pkg = app_bundle.join("Contents").join("PkgInfo");
    fs::write(pkg, b"APPL????")?;
    Ok(())
}

// ----------------------------
// flatten-icon (PNG alpha -> opaque)
// ----------------------------

fn flatten_icon_to_opaque_png(input: &Path, output: &Path) -> Result<()> {
    let rgba = load_png_rgba8(input)?;
    let (width, height) = rgba.dim;

    let cx = width / 2;
    let top = find_bg_color(&rgba.pixels, width, height, cx, 0, 1)?;
    let bottom = find_bg_color(&rgba.pixels, width, height, cx, height.saturating_sub(1), -1)?;

    let mut out = vec![0u8; width * height * 4];
    for y in 0..height {
        let (br, bg, bb) = gradient_color(top, bottom, y, height);
        for x in 0..width {
            let i = (y * width + x) * 4;
            let r = rgba.pixels[i];
            let g = rgba.pixels[i + 1];
            let b = rgba.pixels[i + 2];
            let a = rgba.pixels[i + 3];

            let (rr, gg, bb2) = if a == 255 {
                (r, g, b)
            } else if a == 0 {
                (br, bg, bb)
            } else {
                let a16 = a as u16;
                let inv = 255u16 - a16;
                let rr = ((r as u16 * a16 + br as u16 * inv + 127) / 255) as u8;
                let gg = ((g as u16 * a16 + bg as u16 * inv + 127) / 255) as u8;
                let bb2 = ((b as u16 * a16 + bb as u16 * inv + 127) / 255) as u8;
                (rr, gg, bb2)
            };

            out[i] = rr;
            out[i + 1] = gg;
            out[i + 2] = bb2;
            out[i + 3] = 255;
        }
    }

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    save_png_rgba8(output, width as u32, height as u32, &out)?;
    Ok(())
}

struct RgbaImage {
    dim: (usize, usize),
    pixels: Vec<u8>, // RGBA8
}

fn load_png_rgba8(path: &Path) -> Result<RgbaImage> {
    let file = File::open(path)?;
    let mut decoder = png::Decoder::new(file);
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info()?;

    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf)?;
    let bytes = &buf[..info.buffer_size()];

    let width = info.width as usize;
    let height = info.height as usize;

    let mut rgba: Vec<u8> = Vec::with_capacity(width * height * 4);
    match info.color_type {
        png::ColorType::Rgba => rgba.extend_from_slice(bytes),
        png::ColorType::Rgb => {
            for px in bytes.chunks_exact(3) {
                rgba.extend_from_slice(&[px[0], px[1], px[2], 255]);
            }
        }
        png::ColorType::Grayscale => {
            for &g in bytes.iter() {
                rgba.extend_from_slice(&[g, g, g, 255]);
            }
        }
        png::ColorType::GrayscaleAlpha => {
            for px in bytes.chunks_exact(2) {
                let g = px[0];
                let a = px[1];
                rgba.extend_from_slice(&[g, g, g, a]);
            }
        }
        other => {
            return Err(format!("Unsupported PNG color type: {:?}", other).into());
        }
    }

    Ok(RgbaImage {
        dim: (width, height),
        pixels: rgba,
    })
}

fn save_png_rgba8(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<()> {
    let file = File::create(path)?;
    let w = io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(rgba)?;
    Ok(())
}

fn get_px(rgba: &[u8], width: usize, x: usize, y: usize) -> (u8, u8, u8, u8) {
    let i = (y * width + x) * 4;
    (rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])
}

fn find_bg_color(
    rgba: &[u8],
    width: usize,
    height: usize,
    x: usize,
    start_y: usize,
    step: isize,
) -> Result<(u8, u8, u8)> {
    let mut y = start_y as isize;
    while y >= 0 && (y as usize) < height {
        let (r, g, b, a) = get_px(rgba, width, x, y as usize);
        // Avoid picking foreground white shapes if they overlap the sample point.
        if a > 0 && !(r > 240 && g > 240 && b > 240) {
            return Ok((r, g, b));
        }
        y += step;
    }
    Err("Could not find suitable background color".into())
}

fn gradient_color(
    top: (u8, u8, u8),
    bottom: (u8, u8, u8),
    y: usize,
    height: usize,
) -> (u8, u8, u8) {
    if height <= 1 {
        return top;
    }
    let denom = (height - 1) as u32;
    let y = y as u32;
    let inv = denom - y;

    let lerp = |a: u8, b: u8| -> u8 {
        let v = a as u32 * inv + b as u32 * y;
        ((v + denom / 2) / denom) as u8
    };

    (lerp(top.0, bottom.0), lerp(top.1, bottom.1), lerp(top.2, bottom.2))
}

