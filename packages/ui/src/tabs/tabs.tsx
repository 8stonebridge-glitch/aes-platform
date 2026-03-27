import * as React from "react";

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, defaultTab, activeTab, onTabChange, className = "" }: TabsProps) {
  const [internalActive, setInternalActive] = React.useState(defaultTab ?? tabs[0]?.id ?? "");
  const current = activeTab ?? internalActive;

  const handleSelect = (tabId: string) => {
    if (!activeTab) setInternalActive(tabId);
    onTabChange?.(tabId);
  };

  const activeContent = tabs.find((t) => t.id === current)?.content;

  return (
    <div className={`aes-tabs ${className}`.trim()}>
      <div className="aes-tabs-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            className={`aes-tab ${current === tab.id ? "aes-tab-active" : ""}`}
            aria-selected={current === tab.id}
            aria-controls={`aes-tabpanel-${tab.id}`}
            disabled={tab.disabled}
            onClick={() => handleSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`aes-tabpanel-${current}`}
        role="tabpanel"
        className="aes-tabs-panel"
      >
        {activeContent}
      </div>
    </div>
  );
}
