"use client";

import { Card, CardBody, CardHeader, Spinner, Tabs, Tab } from "@heroui/react";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface DocConfig {
  key: string;
  title: string;
  url: string;
}

const docs: DocConfig[] = [
  {
    key: "examples",
    title: "使用示例",
    url: "/docs-proxy/yosebyte/nodepass/refs/heads/main/docs/zh/examples.md",
  },
  {
    key: "usage",
    title: "使用指南",
    url: "/docs-proxy/yosebyte/nodepass/refs/heads/main/docs/zh/usage.md",
  },
  {
    key: "configuration",
    title: "配置说明",
    url: "/docs-proxy/yosebyte/nodepass/refs/heads/main/docs/zh/configuration.md",
  },
  {
    key: "troubleshooting",
    title: "故障排除",
    url: "/docs-proxy/yosebyte/nodepass/refs/heads/main/docs/zh/troubleshooting.md",
  },
];

/**
 * Docs 页面 - 展示NodePass文档
 */
export default function ExamplesPage() {
  const [selectedTab, setSelectedTab] = useState<string>("examples");
  const [docsContent, setDocsContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 获取指定文档的内容
  const fetchDoc = async (docKey: string, url: string) => {
    if (docsContent[docKey]) return; // 已经加载过了

    setLoading((prev) => ({ ...prev, [docKey]: true }));
    setErrors((prev) => ({ ...prev, [docKey]: "" }));

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `获取文档失败: ${response.status} ${response.statusText}`,
        );
      }

      const content = await response.text();

      setDocsContent((prev) => ({ ...prev, [docKey]: content }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [docKey]: err instanceof Error ? err.message : "获取文档时发生未知错误",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [docKey]: false }));
    }
  };

  // 当选择的tab变化时加载对应文档
  useEffect(() => {
    const selectedDoc = docs.find((doc) => doc.key === selectedTab);

    if (selectedDoc) {
      fetchDoc(selectedDoc.key, selectedDoc.url);
    }
  }, [selectedTab]);

  // 渲染markdown内容的组件
  const renderMarkdownContent = (content: string) => (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        components={{
          // 自定义渲染组件
          h1: ({ children, ...props }) => (
            <h1
              className="text-xl font-bold text-foreground mb-4 border-b border-divider pb-2"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="text-lg font-semibold text-foreground mb-3 mt-6"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="text-base font-medium text-foreground mb-2 mt-4"
              {...props}
            >
              {children}
            </h3>
          ),
          p: ({ children, ...props }) => (
            <p className="text-default-700 mb-3 leading-relaxed" {...props}>
              {children}
            </p>
          ),
          code: ({ children, className, ...props }) => {
            const isInline = !className;

            if (isInline) {
              return (
                <code
                  className="bg-default-100 text-default-800 px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className="block bg-default-100 text-default-800 p-3 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre
              className="bg-default-100 p-3 rounded-lg overflow-x-auto mb-4"
              {...props}
            >
              {children}
            </pre>
          ),
          ul: ({ children, ...props }) => (
            <ul
              className="list-disc list-inside text-default-700 mb-3 space-y-1"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="list-decimal list-inside text-default-700 mb-3 space-y-1"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-default-700" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-primary pl-4 py-2 bg-primary-50 dark:bg-primary-950/30 text-default-700 mb-4 italic"
              {...props}
            >
              {children}
            </blockquote>
          ),
          a: ({ children, href, ...props }) => (
            <a
              className="text-primary hover:text-primary-600 underline"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              {...props}
            >
              {children}
            </a>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-divider" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-divider bg-default-100 px-3 py-2 text-left font-medium text-default-800"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="border border-divider px-3 py-2 text-default-700"
              {...props}
            >
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <Card className="p-6">
        <CardHeader className="pb-3 px-0">
          <div className="flex flex-col items-start gap-1 w-full">
            <h1 className="text-lg font-semibold text-foreground">
              NodePass 文档
            </h1>
            <p className="text-sm text-default-500">
              NodePass 隧道管理工具的完整文档和使用指南
            </p>
          </div>
        </CardHeader>
        <CardBody className="pt-0 px-0">
          <Tabs
            classNames={{
              tabList:
                "gap-6 w-full relative rounded-none p-0 border-b border-divider",
              cursor: "w-full bg-primary",
              tab: "max-w-fit px-0 h-12",
              tabContent: "group-data-[selected=true]:text-primary",
            }}
            selectedKey={selectedTab}
            variant="underlined"
            onSelectionChange={(key) => setSelectedTab(key as string)}
          >
            {docs.map((doc) => (
              <Tab key={doc.key} title={doc.title}>
                <div className="py-4">
                  {loading[doc.key] && (
                    <div className="flex justify-center items-center py-8">
                      <div className="flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-default-500">加载文档中...</span>
                      </div>
                    </div>
                  )}

                  {errors[doc.key] && (
                    <div className="flex justify-center items-center py-8">
                      <div className="text-center">
                        <p className="text-danger mb-2">加载失败</p>
                        <p className="text-sm text-default-500">
                          {errors[doc.key]}
                        </p>
                      </div>
                    </div>
                  )}

                  {!loading[doc.key] &&
                    !errors[doc.key] &&
                    docsContent[doc.key] &&
                    renderMarkdownContent(docsContent[doc.key])}
                </div>
              </Tab>
            ))}
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
}
