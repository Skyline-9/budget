import React from "react";
import { 
  ArrowRight, 
  BarChart3, 
  Calendar, 
  Filter, 
  Receipt, 
  Tags, 
  Zap,
  Search,
  Plus,
  Edit,
  Trash2,
  Target,
  Settings,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import dotsOverlayUrl from "@/assets/dashboard/dots-overlay.svg";

function Section({ 
  title, 
  icon, 
  children, 
  className 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-3xl border border-border/60 bg-card/50 p-6 shadow-soft-lg", className)}>
      <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30 text-primary">
          {icon}
        </span>
        {title}
      </div>
      <div className="mt-4 space-y-4 text-sm text-foreground/90">
        {children}
      </div>
    </div>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function Shortcut({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-muted-foreground">{description}</div>
      <div className="flex shrink-0 items-center gap-1.5">
        {keys.map((k, idx) => (
          <kbd
            key={`${k}:${idx}`}
            className="inline-flex items-center rounded-lg border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Help & Documentation</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">How to use Budget</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Everything you need to know to track your finances effectively
        </div>
      </div>

      {/* Getting Started */}
      <Section 
        title="Getting Started" 
        icon={<Zap className="h-4 w-4" />}
        className="corner-glow-hero tint-hero relative overflow-hidden"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10] dark:opacity-[0.08]">
        <img src={dotsOverlayUrl} alt="" className="h-full w-full object-cover scale-80" />
      </div>
        <p className="relative z-10">
          Budget is a personal finance app designed for speed and simplicity. Track income and expenses, 
          organize with categories, set budgets, and visualize your spending patterns.
        </p>
        <div className="relative z-10 space-y-3">
          <Feature
            title="1. Create Categories"
            description="Start by setting up income and expense categories. Categories can be nested (e.g., Food → Restaurants → Fast Food)."
          />
          <Feature
            title="2. Add Transactions"
            description="Use Quick Add on the Transactions page or press N anywhere. Transactions are automatically signed based on category type."
          />
          <Feature
            title="3. Set Budgets"
            description="On the Dashboard, set monthly budgets for expense categories. Track progress and get adjusted budgets based on spending."
          />
          <Feature
            title="4. Review Insights"
            description="View charts, trends, and category breakdowns on the Dashboard. Filter transactions by date, category, or amount."
          />
        </div>
      </Section>

      {/* Dashboard */}
      <Section title="Dashboard" icon={<BarChart3 className="h-4 w-4" />}>
        <p>
          Your financial overview at a glance. The Dashboard shows key metrics, budget status, and visual insights.
        </p>
        <div className="space-y-3">
          <Feature
            title="Summary Cards"
            description="Track income, expenses, net cash flow, and savings rate. Hover over cards to see sparklines showing trends."
          />
          <Feature
            title="Budget Card"
            description="Monitor monthly spending against your budget. Adjusted budget accounts for partial months and shows projected spend."
          />
          <Feature
            title="Charts"
            description="Daily/monthly trends, category rankings, and historical spending patterns. Click categories to filter transactions."
          />
        </div>
        <div className="rounded-2xl bg-background/30 p-3 ring-1 ring-border/60">
          <div className="text-xs font-semibold text-muted-foreground">Quick Actions</div>
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span>Click "Set" or "Edit" on Budget Card to configure monthly budgets</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>Click chart categories to jump to filtered transactions</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Transactions */}
      <Section title="Transactions" icon={<Receipt className="h-4 w-4" />}>
        <p>
          Fast entry and review of all your financial transactions. Search, filter, sort, and edit with ease.
        </p>
        <div className="space-y-3">
          <Feature
            title="Quick Add"
            description="Add transactions instantly without leaving the page. Amount is automatically signed based on category (expenses negative, income positive)."
          />
          <Feature
            title="Filters"
            description="Built into the table: filter by category, date range, or amount (min/max). Active filters show as removable chips."
          />
          <Feature
            title="Search"
            description="Use Cmd/Ctrl+K or / to search merchant names and notes. Search works across the entire app."
          />
          <Feature
            title="Table Actions"
            description="Click any row to edit. Use the actions menu (⋯) to duplicate or delete transactions."
          />
        </div>
        <div className="rounded-2xl bg-background/30 p-3 ring-1 ring-border/60">
          <div className="text-xs font-semibold text-muted-foreground">Quick Add Tips</div>
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Press Enter to submit, Esc to clear</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Toggle "Keep values" to retain category after adding</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>No need to add - or + signs, category determines if it's income or expense</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Categories */}
      <Section title="Categories" icon={<Tags className="h-4 w-4" />}>
        <p>
          Organize transactions with hierarchical categories. Create income and expense categories, 
          customize colors, and nest them for detailed tracking.
        </p>
        <div className="space-y-3">
          <Feature
            title="Create & Organize"
            description="Add categories with the + button. Drag to reorder, or make a category a child of another by clicking the parent dropdown."
          />
          <Feature
            title="Hierarchical Structure"
            description="Nest categories up to any depth (e.g., Transportation → Car → Gas). Parent categories roll up child spending."
          />
          <Feature
            title="Color Coding"
            description="Assign colors to help identify categories at a glance. Colors appear in charts and transaction lists."
          />
          <Feature
            title="Active/Inactive"
            description="Toggle categories inactive to hide them from dropdowns without losing historical data."
          />
        </div>
        <div className="rounded-2xl bg-background/30 p-3 ring-1 ring-border/60">
          <div className="text-xs font-semibold text-muted-foreground">Selection & Editing</div>
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Select multiple with Shift+Click (range) or Cmd/Ctrl+Click (toggle)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Use arrow keys to navigate, Enter to open inspector, Space to toggle selection</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              <span>Bulk actions: reorder, set parent, toggle active status, or delete multiple at once</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Settings */}
      <Section title="Settings" icon={<Settings className="h-4 w-4" />}>
        <p>
          Customize your experience with theme, API mode, and data management.
        </p>
        <div className="space-y-3">
          <Feature
            title="Theme"
            description="Choose between light, dark, or system-adaptive theme. Changes apply immediately."
          />
          <Feature
            title="API Mode"
            description="Toggle between mock data (demo) and real API backend. Mock mode is perfect for testing."
          />
          <Feature
            title="Data Management"
            description="Export your data as JSON for backup or analysis. Use reset to clear all data and start fresh."
          />
        </div>
      </Section>

      {/* Keyboard Shortcuts */}
      <Section title="Keyboard Shortcuts" icon={<ArrowRight className="h-4 w-4" />}>
        <p>Speed up your workflow with keyboard shortcuts. These work from anywhere in the app:</p>
        <div className="space-y-2">
          <Shortcut keys={["⌘K", "Ctrl K"]} description="Focus global search" />
          <Shortcut keys={["/"]} description="Quick search (when not typing)" />
          <Shortcut keys={["N"]} description="Add transaction (when not typing)" />
          <Shortcut keys={["Enter"]} description="Submit Quick Add / open table row" />
          <Shortcut keys={["Esc"]} description="Clear Quick Add / close dialogs" />
        </div>
        <div className="mt-4 rounded-2xl bg-background/30 p-3 ring-1 ring-border/60">
          <div className="text-xs font-semibold text-muted-foreground">Categories Shortcuts</div>
          <div className="mt-2 space-y-2">
            <Shortcut keys={["↑", "↓"]} description="Navigate rows" />
            <Shortcut keys={["Space"]} description="Toggle selection" />
            <Shortcut keys={["Shift", "Click"]} description="Range select" />
            <Shortcut keys={["⌘ Click", "Ctrl Click"]} description="Toggle selection" />
          </div>
        </div>
      </Section>

      {/* Tips & Best Practices */}
      <Section title="Tips & Best Practices" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="space-y-3">
          <Feature
            title="Set Realistic Budgets"
            description="Start with your actual spending patterns, then gradually adjust. The adjusted budget feature helps with partial months."
          />
          <Feature
            title="Use Category Hierarchy"
            description="Group related expenses (e.g., all food categories under 'Food') to see both detailed and summary views."
          />
          <Feature
            title="Regular Reviews"
            description="Check your Dashboard weekly. Review charts to spot trends and adjust spending or budgets accordingly."
          />
          <Feature
            title="Add Notes"
            description="Use the notes field for transactions that need context. Makes reviewing much easier later."
          />
          <Feature
            title="Date Filters"
            description="Use the date picker in the topbar to focus on specific periods. Great for monthly reviews or tax prep."
          />
        </div>
      </Section>

      {/* Quick Links */}
      <div className="rounded-3xl border border-border/60 bg-card/50 p-6 shadow-soft-lg">
        <div className="text-sm font-semibold tracking-tight">Ready to start?</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/dashboard">
            <Button variant="default">
              <BarChart3 className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link to="/transactions">
            <Button variant="secondary">
              <Receipt className="h-4 w-4" />
              Add Transactions
            </Button>
          </Link>
          <Link to="/categories">
            <Button variant="secondary">
              <Tags className="h-4 w-4" />
              Setup Categories
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

