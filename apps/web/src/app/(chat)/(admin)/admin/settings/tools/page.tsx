"use client";

import {
  ShortcutHelpModal,
  useAdminShortcuts,
} from "@/components/admin/ui/shortcut-help-modal";
import {
  showSaveError,
  showSaveSuccess,
} from "@/components/admin/ui/toast-helpers";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  AlertCircle,
  CheckCircle,
  CheckCircle2Icon,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  KeyIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  WrenchIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Switch } from "ui/switch";

// Staging port note (WP6c): the destination derives this list from
// lib/ai/tools/toolkit-catalog.ts. Staging has no equivalent catalog and no
// runtime consumer of site_config tools.categories yet, so the destination
// catalog data is embedded here verbatim to preserve the destination
// site_config schema. Connectors' apiKeyId ("google" on the destination) is
// dropped because staging's /api/admin/api-keys has no Google key entry.
const TOOL_CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  tools: string[];
  desc: string;
  apiKeyId: string | null;
}[] = [
  {
    id: "Code",
    label: "Code Execution",
    icon: "💻",
    desc: "Browser-sandboxed snippets plus a full Linux sandbox",
    tools: ["Sandbox (Linux VM)", "JavaScript", "Python"],
    apiKeyId: null,
  },
  {
    id: "Visualization",
    label: "Visualization",
    icon: "📊",
    desc: "Charts and tables rendered in the conversation",
    tools: ["Pie Chart", "Bar Chart", "Line Chart", "Table"],
    apiKeyId: null,
  },
  {
    id: "Video",
    label: "Video Generation",
    icon: "🎬",
    desc: "AI video generation",
    tools: ["Video Generation"],
    apiKeyId: null,
  },
  {
    id: "Artifacts",
    label: "Artifacts",
    icon: "✨",
    desc: "Standalone code artifacts",
    tools: ["Artifact Creation"],
    apiKeyId: null,
  },
  {
    id: "Canvas",
    label: "Canvas",
    icon: "🎨",
    desc: "Presentations and the E Canvas drawing surface",
    tools: ["PPT Maker", "E Canvas"],
    apiKeyId: null,
  },
  {
    id: "Memory",
    label: "Memory",
    icon: "🧠",
    desc: "Long-term user memory",
    tools: ["Save Memory", "Search Memory", "Delete Memory"],
    apiKeyId: null,
  },
  {
    id: "WebSearch",
    label: "Web Search",
    icon: "🔍",
    desc: "Search and content extraction",
    tools: [
      "Web Search",
      "Web Content",
      "YouTube Search",
      "YouTube Transcript",
    ],
    apiKeyId: "exa",
  },
  {
    id: "Http",
    label: "HTTP Fetch",
    icon: "🔌",
    desc: "Direct HTTP requests to arbitrary endpoints",
    tools: ["HTTP Fetch"],
    apiKeyId: null,
  },
  {
    id: "Connectors",
    label: "Connectors",
    icon: "🔗",
    desc: "Gmail, Drive, Calendar, Slack, Notion, GitHub, Jira and ~40 more",
    tools: [
      "Gmail",
      "Drive",
      "Calendar",
      "Slack",
      "Notion",
      "GitHub",
      "+43 more",
    ],
    apiKeyId: null,
  },
  {
    id: "Scheduler",
    label: "Scheduler",
    icon: "⏰",
    desc: "Recurring and future-dated agent runs",
    tools: ["Scheduler"],
    apiKeyId: null,
  },
  {
    id: "Notifications",
    label: "Notifications",
    icon: "🔔",
    desc: "Post a concise update to the user's notification inbox and browser push subscription",
    tools: ["Post User Update"],
    apiKeyId: null,
  },
  {
    id: "Build",
    label: "App Builder",
    icon: "🔨",
    desc: "E2B app builder with a live preview URL",
    tools: ["Build App"],
    apiKeyId: null,
  },
  {
    id: "CodeEngine",
    label: "Code Engine",
    icon: "⚙️",
    desc: "Orchestrate other tools from a code block (opt-in mention)",
    tools: ["Code Engine"],
    apiKeyId: null,
  },
  {
    id: "Custom",
    label: "Custom Tools",
    icon: "🛠️",
    desc: "Dynamically added tools",
    tools: [] as string[],
    apiKeyId: null,
  },
];

const CATEGORY_OPTIONS = [
  ...TOOL_CATEGORIES.filter((c) => c.id !== "Custom").map((c) => c.label),
  "Custom",
];

interface DynamicTool {
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  addedAt: string;
}

interface ApiKeyEntry {
  id: string;
  label: string;
  envVar: string;
  configured: boolean;
  masked: string | null;
  hasEnvOverride: boolean;
}

interface ToolsConfig {
  categories: Record<
    string,
    { enabled: boolean; tools: Record<string, boolean> }
  >;
  apiKeys: Record<string, boolean>;
  dynamicTools?: Record<string, DynamicTool>;
}

export default function ToolsPage() {
  const [config, setConfig] = useState<ToolsConfig>({
    categories: {},
    apiKeys: {},
  });
  const [initialConfig, setInitialConfig] = useState<ToolsConfig>({
    categories: {},
    apiKeys: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(TOOL_CATEGORIES.map((c) => c.id)),
  );
  const [isDirty, setIsDirty] = useState(false);
  const { showHelp, setShowHelp } = useAdminShortcuts();
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyEntry | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [showKeyVal, setShowKeyVal] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolCategory, setNewToolCategory] = useState("Custom");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [newToolEnabled, setNewToolEnabled] = useState(true);
  const [savingTool, setSavingTool] = useState(false);
  const [dynamicTools, setDynamicTools] = useState<
    {
      id: string;
      name: string;
      category: string;
      description: string;
      enabled: boolean;
      addedAt: string;
    }[]
  >([]);

  useEffect(() => {
    setIsDirty(JSON.stringify(initialConfig) !== JSON.stringify(config));
  }, [config, initialConfig]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/config").then((r) => r.json()),
      fetch("/api/admin/api-keys")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/admin/tools")
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([configData, keysData, toolsData]) => {
        if (configData.success && configData.config?.tools) {
          setConfig(configData.config.tools);
          setInitialConfig(configData.config.tools);
          if (keysData?.success) {
            setApiKeys(keysData.keys ?? []);
            const keyStatus: Record<string, boolean> = {};
            (keysData.keys ?? []).forEach((k: ApiKeyEntry) => {
              keyStatus[k.id] = k.configured;
            });
            setConfig((prev) => ({ ...prev, apiKeys: keyStatus }));
          }
          if (toolsData?.success && toolsData.tools) {
            setDynamicTools(toolsData.tools);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "tools", settings: config }),
      });
      if (res.ok) {
        setSaved(true);
        setInitialConfig(config);
        showSaveSuccess("Tools configuration saved");
        setTimeout(() => setSaved(false), 3000);
      } else {
        showSaveError();
      }
    } catch {
      showSaveError();
    } finally {
      setSaving(false);
    }
  }, [config]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const toggleCat = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [id]: {
          enabled: !prev.categories[id]?.enabled,
          tools: prev.categories[id]?.tools ?? {},
        },
      },
    }));
  };

  const toggleTool = (catId: string, tool: string) => {
    setConfig((prev) => {
      const cat = prev.categories[catId] ?? { enabled: true, tools: {} };
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [catId]: {
            ...cat,
            tools: { ...cat.tools, [tool]: !cat.tools[tool] },
          },
        },
      };
    });
  };

  const toggleSection = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEditKey = (key: ApiKeyEntry) => {
    setEditingKey(key);
    setKeyValue("");
    setShowKeyVal(false);
    setShowKeyModal(true);
  };

  const handleSaveKey = async () => {
    if (!editingKey) return;
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: editingKey.id, value: keyValue }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys((prev) =>
          prev.map((k) =>
            k.id === editingKey.id
              ? { ...k, configured: !!data.configured, masked: data.masked }
              : k,
          ),
        );
        setConfig((prev) => ({
          ...prev,
          apiKeys: { ...prev.apiKeys, [editingKey.id]: !!data.configured },
        }));
        showSaveSuccess(
          `${editingKey.label} ${keyValue ? "saved" : "removed"}`,
        );
        setShowKeyModal(false);
        setEditingKey(null);
        setKeyValue("");
      } else {
        showSaveError(data.error ?? "Failed to save API key");
      }
    } catch {
      showSaveError("Failed to save API key");
    } finally {
      setSavingKey(false);
    }
  };

  const handleAddTool = async () => {
    if (!newToolName.trim()) return;
    setSavingTool(true);
    try {
      const res = await fetch("/api/admin/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newToolName.trim(),
          category: newToolCategory.trim(),
          description: newToolDescription.trim(),
          enabled: newToolEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDynamicTools((prev) => {
          const filtered = prev.filter((t) => t.id !== data.id);
          return [
            ...filtered,
            {
              id: data.id,
              name: newToolName.trim(),
              category: (newToolCategory || "Custom").trim(),
              description: newToolDescription.trim(),
              enabled: newToolEnabled,
              addedAt: new Date().toISOString(),
            },
          ];
        });
        setShowAddTool(false);
        setNewToolName("");
        setNewToolCategory("Custom");
        setNewToolDescription("");
        setNewToolEnabled(true);
        showSaveSuccess("Tool added");
      } else {
        showSaveError(data.error ?? "Failed to add tool");
      }
    } catch {
      showSaveError("Failed to add tool");
    } finally {
      setSavingTool(false);
    }
  };

  const deleteDynamicTool = async (id: string) => {
    if (!window.confirm("Remove this tool?")) return;
    try {
      const res = await fetch(`/api/admin/tools?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setDynamicTools((prev) => prev.filter((t) => t.id !== id));
        showSaveSuccess("Tool removed");
      } else {
        showSaveError(data.error ?? "Failed to remove tool");
      }
    } catch {
      showSaveError("Failed to remove tool");
    }
  };

  const enabledCount = TOOL_CATEGORIES.filter(
    (c) => config.categories[c.id]?.enabled,
  ).length;
  const totalEnabled = TOOL_CATEGORIES.reduce(
    (acc, c) => acc + (config.categories[c.id]?.enabled ? c.tools.length : 0),
    0,
  );
  const configuredKeys = apiKeys.filter((k) => k.configured).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="border rounded-xl bg-card p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Settings</Eyebrow>
            <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
              <WrenchIcon className="size-6 text-muted-foreground" />
              Tools
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {totalEnabled} tools enabled across {enabledCount} categories.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-xs text-amber-600 flex items-center gap-1.5">
                Unsaved changes
              </span>
            )}
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                <CheckCircle2Icon className="size-4" />
                Saved
              </span>
            )}
            <button
              onClick={() => {
                if (window.confirm("Reset to saved values?"))
                  setConfig(initialConfig);
              }}
              className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
            <Button
              onClick={handleSave}
              disabled={saving || !isDirty}
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <button
              onClick={() => setShowHelp(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Keyboard shortcuts"
            >
              ?
            </button>
          </div>
        </div>

        {/* API Keys Management */}
        <div className="border rounded-xl bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
                <KeyIcon className="size-4 text-muted-foreground" />
                API Keys
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {configuredKeys}/{apiKeys.length} keys configured — encrypted
                with AES-256-GCM
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{key.label}</span>
                    {key.hasEnvOverride && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">
                        Env
                      </span>
                    )}
                    {key.configured ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="size-3" />
                        {key.masked ?? "Configured"}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        Not Set
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {key.envVar}
                  </p>
                </div>
                {!key.hasEnvOverride && (
                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={() => openEditKey(key)}
                      className="p-2 rounded-md hover:bg-muted transition-colors"
                      title={key.configured ? "Edit key" : "Add key"}
                    >
                      {key.configured ? (
                        <Pencil className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Plus className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                    {key.configured && (
                      <button
                        onClick={() =>
                          openEditKey({
                            ...key,
                            configured: false,
                            masked: null,
                          })
                        }
                        className="p-2 rounded-md hover:bg-red-500/10 transition-colors"
                        title="Remove key"
                      >
                        <Trash2 className="size-3.5 text-red-500" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tool Categories */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tool Categories
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTool(true)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" /> Add Tool
            </Button>
          </div>
          {TOOL_CATEGORIES.map((cat) => {
            const catConfig = config.categories?.[cat.id];
            const enabled = catConfig?.enabled ?? true;
            const expanded = expandedCats.has(cat.id);
            const dynamicToolList = cat.id === "Custom" ? dynamicTools : null;
            const enabledTools =
              cat.id === "Custom"
                ? (dynamicToolList?.filter((t) => t.enabled).length ?? 0)
                : cat.tools.filter((t) => catConfig?.tools?.[t] !== false)
                    .length;

            return (
              <div
                key={cat.id}
                className="border rounded-xl bg-card overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleSection(cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection(cat.id);
                      }}
                    >
                      {expanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </button>
                    <span className="text-lg">{cat.icon}</span>
                    <div>
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        — {cat.desc}
                      </span>
                    </div>
                    {enabled && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {enabledTools}/
                        {cat.id === "Custom"
                          ? (dynamicToolList?.length ?? 0)
                          : cat.tools.length}{" "}
                        tools
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {cat.apiKeyId && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          apiKeys.find((k) => k.id === cat.apiKeyId)?.configured
                            ? "bg-green-500/10 text-green-600"
                            : "bg-amber-500/10 text-amber-600"
                        }`}
                      >
                        {apiKeys.find((k) => k.id === cat.apiKeyId)?.configured
                          ? "Key Set"
                          : "No Key"}
                      </span>
                    )}
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => {
                        toggleCat(cat.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                {expanded && enabled && (
                  <div className="border-t px-5 py-4 flex flex-wrap gap-3">
                    {cat.id === "Custom" ? (
                      dynamicToolList && dynamicToolList.length > 0 ? (
                        dynamicToolList.map((tool) => (
                          <div
                            key={tool.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background"
                          >
                            <span className="text-sm">{tool.name}</span>
                            <span className="text-xs text-muted-foreground border-l pl-2 ml-1">
                              {tool.category}
                            </span>
                            {tool.description && (
                              <span className="text-xs text-muted-foreground/70 italic border-l pl-2 ml-1 truncate max-w-[200px]">
                                {tool.description}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDynamicTool(tool.id);
                              }}
                              className="ml-auto p-1 rounded-md hover:bg-red-500/10 transition-colors"
                              title="Remove tool"
                            >
                              <Trash2 className="size-3.5 text-red-500" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">
                          No custom tools yet. Click &ldquo;Add Tool&rdquo; to
                          create one.
                        </p>
                      )
                    ) : (
                      cat.tools.map((tool) => {
                        const toolEnabled = catConfig?.tools?.[tool] ?? true;
                        return (
                          <label
                            key={tool}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 bg-background"
                          >
                            <Switch
                              checked={toolEnabled}
                              onCheckedChange={() => toggleTool(cat.id, tool)}
                              onClick={(e) => e.stopPropagation()}
                              className="scale-90"
                            />
                            <span className="text-sm">{tool}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Tool Modal */}
      {showAddTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddTool(false)}
          />
          <div className="relative z-10 bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="text-base font-semibold">Add Custom Tool</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Register a new tool for this platform
                </p>
              </div>
              <button
                onClick={() => setShowAddTool(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Tool Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  placeholder="e.g. GitHub Issues"
                  className="w-full h-10 px-3 text-sm rounded-md border bg-background"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Category
                </label>
                <select
                  value={newToolCategory}
                  onChange={(e) => setNewToolCategory(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-md border bg-background"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Description
                </label>
                <textarea
                  value={newToolDescription}
                  onChange={(e) => setNewToolDescription(e.target.value)}
                  placeholder="Brief description of what this tool does"
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Enabled</label>
                <Switch
                  checked={newToolEnabled}
                  onCheckedChange={setNewToolEnabled}
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddTool(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddTool}
                disabled={savingTool || !newToolName.trim()}
              >
                {savingTool ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  "Add Tool"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Edit Modal */}
      {showKeyModal && editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowKeyModal(false)}
          />
          <div className="relative z-10 bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="text-base font-semibold">
                  {editingKey.configured ? "Update" : "Add"} API Key
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editingKey.label}
                </p>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1">
                {editingKey.envVar}
              </p>
              {editingKey.masked && (
                <p className="text-xs text-green-600">
                  Current: {editingKey.masked}
                </p>
              )}
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  {editingKey.configured
                    ? "New value (leave blank to remove)"
                    : "API Key"}
                </label>
                <div className="relative">
                  <input
                    type={showKeyVal ? "text" : "password"}
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder={
                      editingKey.configured
                        ? "Enter new key to replace, or blank to remove"
                        : "Paste your API key here"
                    }
                    className="w-full h-10 px-3 pr-10 text-sm rounded-md border bg-background"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyVal((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showKeyVal ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Key is encrypted with AES-256-GCM before storage.
              </p>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowKeyModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveKey}
                disabled={savingKey}
              >
                {savingKey ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
