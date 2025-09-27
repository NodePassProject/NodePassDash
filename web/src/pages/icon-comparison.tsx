import React, { useState } from "react";
import { Card, CardBody, CardHeader, Chip, Tabs, Tab } from "@heroui/react";
import { Icon } from "@iconify/react";

// 导入 CellValue 组件进行演示
const DemoCellValue = React.forwardRef<
  HTMLDivElement,
  {
    label: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    onPress?: () => void;
  }
>(({ label, value, icon, onPress }, ref) => {
  const isClickable = Boolean(onPress);

  return (
    <div
      ref={ref}
      className={`flex items-start gap-3 ${
        isClickable
          ? "cursor-pointer hover:bg-default-50 active:bg-default-100 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors"
          : ""
      }`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onPress}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPress?.();
              }
            }
          : undefined
      }
    >
      {/* Icon column */}
      <div
        className="flex-shrink-0 flex items-center justify-center bg-default-100 rounded-md"
        style={{
          width: "calc(1.25rem + 0.125rem + 1.25rem)",
          height: "calc(1.25rem + 0.125rem + 1.25rem)",
        }}
      >
        {icon}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Label row */}
        <div className="text-small text-default-500 leading-tight h-5">
          {label}
        </div>
        {/* Value row */}
        <div className="text-small font-medium mt-0.5 break-words h-5">
          {value}
        </div>
      </div>
    </div>
  );
});

// 定义五种图标方案
const iconLibraries = [
  {
    name: "Material Design Icons (MDI)",
    key: "mdi",
    description: "风格现代，图标丰富，适合现代Web应用",
    color: "primary",
  },
  {
    name: "Lucide",
    key: "lucide",
    description: "简洁清晰，线条优美，适合简约设计风格",
    color: "secondary",
  },
  {
    name: "Tabler Icons",
    key: "tabler",
    description: "专为界面设计，一致性好，适合管理后台",
    color: "success",
  },
  {
    name: "Heroicons",
    key: "heroicons",
    description: "Tailwind CSS官方推荐，适合现代响应式设计",
    color: "warning",
  },
  {
    name: "Carbon Design System",
    key: "carbon",
    description: "IBM设计系统，适合企业级应用",
    color: "danger",
  },
];

// 图标映射配置
const iconMappings = {
  mdi: {
    实例ID: "mdi:identifier",
    主控: "mdi:server-network",
    版本号: "mdi:source-branch",
    模式: "mdi:tune",
    隧道地址: "mdi:tunnel",
    目标地址: "mdi:target",
    日志级别: "mdi:file-document-outline",
    池最小值: "mdi:pool",
    池最大值: "mdi:pool",
    最大连接数限制: "mdi:connection",
    TLS设置: "mdi:security",
    证书路径: "mdi:certificate",
    密钥路径: "mdi:key",
    隧道密码: "mdi:lock",
    读取超时: "mdi:timer",
    速率限制: "mdi:speedometer",
    自动重启: "mdi:restart",
    "Proxy Protocol": "mdi:protocol",
  },
  lucide: {
    实例ID: "lucide:hash",
    主控: "lucide:server",
    版本号: "lucide:git-branch",
    模式: "lucide:settings",
    隧道地址: "lucide:link",
    目标地址: "lucide:target",
    日志级别: "lucide:file-text",
    池最小值: "lucide:layers",
    池最大值: "lucide:layers",
    最大连接数限制: "lucide:link-2",
    TLS设置: "lucide:shield",
    证书路径: "lucide:award",
    密钥路径: "lucide:key",
    隧道密码: "lucide:lock",
    读取超时: "lucide:clock",
    速率限制: "lucide:gauge",
    自动重启: "lucide:rotate-ccw",
    "Proxy Protocol": "lucide:shuffle",
  },
  tabler: {
    实例ID: "tabler:id",
    主控: "tabler:server",
    版本号: "tabler:versions",
    模式: "tabler:adjustments",
    隧道地址: "tabler:route",
    目标地址: "tabler:target-arrow",
    日志级别: "tabler:report",
    池最小值: "tabler:stack-2",
    池最大值: "tabler:stack-3",
    最大连接数限制: "tabler:plug-connected",
    TLS设置: "tabler:shield-lock",
    证书路径: "tabler:certificate",
    密钥路径: "tabler:key",
    隧道密码: "tabler:password",
    读取超时: "tabler:hourglass",
    速率限制: "tabler:dashboard",
    自动重启: "tabler:refresh",
    "Proxy Protocol": "tabler:route-2",
  },
  heroicons: {
    实例ID: "heroicons:identification",
    主控: "heroicons:server-stack",
    版本号: "heroicons:code-bracket",
    模式: "heroicons:cog-6-tooth",
    隧道地址: "heroicons:globe-alt",
    目标地址: "heroicons:arrow-top-right-on-square",
    日志级别: "heroicons:document-text",
    池最小值: "heroicons:queue-list",
    池最大值: "heroicons:bars-3-bottom-right",
    最大连接数限制: "heroicons:signal",
    TLS设置: "heroicons:lock-closed",
    证书路径: "heroicons:academic-cap",
    密钥路径: "heroicons:key",
    隧道密码: "heroicons:lock-closed",
    读取超时: "heroicons:clock",
    速率限制: "heroicons:chart-bar",
    自动重启: "heroicons:arrow-path",
    "Proxy Protocol": "heroicons:arrows-right-left",
  },
  carbon: {
    实例ID: "carbon:ibm-cloud-identity-access-management",
    主控: "carbon:cloud-service-management",
    版本号: "carbon:version",
    模式: "carbon:settings-adjust",
    隧道地址: "carbon:network-3",
    目标地址: "carbon:location",
    日志级别: "carbon:debug",
    池最小值: "carbon:network-interface",
    池最大值: "carbon:ibm-cloud-pak-manta-automated-data-lineage",
    最大连接数限制: "carbon:network-4",
    TLS设置: "carbon:security",
    证书路径: "carbon:certificate",
    密钥路径: "carbon:password",
    隧道密码: "carbon:password",
    读取超时: "carbon:timer",
    速率限制: "carbon:meter",
    自动重启: "carbon:restart",
    "Proxy Protocol": "carbon:network-overlay",
  },
};

// 字段分类和Demo值
const fieldCategories = [
  {
    name: "基础配置字段",
    fields: [
      { name: "实例ID", demoValue: "6439680a" },
      {
        name: "主控",
        demoValue: (
          <Chip color="default" size="sm" variant="bordered">
            DMIT
          </Chip>
        ),
      },
      {
        name: "版本号",
        demoValue: (
          <Chip color="secondary" size="sm" variant="flat">
            v1.4.2
          </Chip>
        ),
      },
      {
        name: "模式",
        demoValue: (
          <Chip color="primary" size="sm" variant="flat">
            客户端模式
          </Chip>
        ),
      },
      {
        name: "隧道地址",
        demoValue: (
          <span className="font-mono text-sm">tunnel.example.com:8080</span>
        ),
      },
      {
        name: "目标地址",
        demoValue: <span className="font-mono text-sm">localhost:3000</span>,
      },
      {
        name: "日志级别",
        demoValue: (
          <Chip color="primary" size="sm" variant="flat">
            继承主控 [INFO]
          </Chip>
        ),
      },
    ],
  },
  {
    name: "池配置字段",
    fields: [
      {
        name: "池最小值",
        demoValue: (
          <span className="font-mono text-sm">
            64 <span className="text-default-400 text-xs">(min)</span>
          </span>
        ),
      },
      {
        name: "池最大值",
        demoValue: (
          <span className="font-mono text-sm">
            1024 <span className="text-default-400 text-xs">(max)</span>
          </span>
        ),
      },
      {
        name: "最大连接数限制",
        demoValue: <span className="font-mono text-sm">500</span>,
      },
    ],
  },
  {
    name: "安全配置字段",
    fields: [
      {
        name: "TLS设置",
        demoValue: (
          <Chip color="success" size="sm" variant="flat">
            自签名证书
          </Chip>
        ),
      },
      { name: "证书路径", demoValue: "/etc/ssl/certs/server.crt" },
      { name: "密钥路径", demoValue: "/etc/ssl/private/server.key" },
      { name: "隧道密码", demoValue: "••••••••" },
    ],
  },
  {
    name: "性能配置字段",
    fields: [
      {
        name: "读取超时",
        demoValue: (
          <span className="font-mono text-sm text-default-600">30s</span>
        ),
      },
      {
        name: "速率限制",
        demoValue: (
          <span className="font-mono text-sm text-default-600">
            100 <span className="text-default-400 text-xs">Mbps</span>
          </span>
        ),
      },
    ],
  },
  {
    name: "高级配置字段",
    fields: [
      {
        name: "自动重启",
        demoValue: (
          <Chip color="success" size="sm" variant="flat">
            已启用
          </Chip>
        ),
      },
      {
        name: "Proxy Protocol",
        demoValue: (
          <Chip color="warning" size="sm" variant="flat">
            v1 & v2
          </Chip>
        ),
      },
    ],
  },
];

const IconComparisonPage: React.FC = () => {
  const [selectedLibrary, setSelectedLibrary] = useState<string>("lucide");
  const [copiedIcon, setCopiedIcon] = useState<string>("");
  const [demoAutoRestart, setDemoAutoRestart] = useState<boolean>(true);

  const handleCopyIcon = (iconName: string, libraryKey: string) => {
    const fullIconName =
      iconMappings[libraryKey as keyof typeof iconMappings]?.[iconName];

    if (fullIconName) {
      navigator.clipboard.writeText(fullIconName);
      setCopiedIcon(fullIconName);
      setTimeout(() => setCopiedIcon(""), 2000);
    }
  };

  const renderIconGrid = (libraryKey: string) => {
    const library = iconLibraries.find((lib) => lib.key === libraryKey);

    if (!library) return null;

    return (
      <div className="space-y-6">
        {fieldCategories.map((category, categoryIndex) => (
          <Card key={categoryIndex} className="p-4">
            <CardHeader className="pb-2">
              <h3 className="text-lg font-semibold">{category.name}</h3>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.fields.map((field, fieldIndex) => {
                  const iconName =
                    iconMappings[libraryKey as keyof typeof iconMappings]?.[
                      field.name
                    ];

                  return (
                    <div
                      key={fieldIndex}
                      className={`border rounded-lg p-3 transition-colors ${
                        field.name === "自动重启"
                          ? ""
                          : "hover:bg-default-50 cursor-pointer"
                      }`}
                      onClick={
                        field.name === "自动重启"
                          ? undefined
                          : () => handleCopyIcon(field.name, libraryKey)
                      }
                    >
                      {/* 使用实际的 CellValue 组件展示 */}
                      <DemoCellValue
                        icon={
                          <Icon
                            className="text-default-600"
                            height={18}
                            icon={iconName || "lucide:help-circle"}
                            width={18}
                          />
                        }
                        label={field.name}
                        value={
                          field.name === "自动重启" ? (
                            <Chip
                              color={demoAutoRestart ? "success" : "danger"}
                              size="sm"
                              variant="flat"
                            >
                              {demoAutoRestart ? "已启用" : "已禁用"}
                            </Chip>
                          ) : (
                            field.demoValue
                          )
                        }
                        onPress={
                          field.name === "自动重启"
                            ? () => setDemoAutoRestart(!demoAutoRestart)
                            : undefined
                        }
                      />

                      {/* 图标名称显示 */}
                      <div className="mt-2 pt-2 border-t border-default-200">
                        <div className="text-xs text-default-400 font-mono break-all">
                          {iconName}
                        </div>
                        {copiedIcon === iconName && (
                          <Chip
                            className="mt-1"
                            color="success"
                            size="sm"
                            variant="flat"
                          >
                            已复制!
                          </Chip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">图标库对比选择</h1>
            <p className="text-default-600">
              选择您偏好的图标库风格。点击任意图标可复制其名称到剪贴板。
            </p>
          </div>
        </CardHeader>
      </Card>

      <Tabs
        aria-label="Icon Libraries"
        className="mb-6"
        selectedKey={selectedLibrary}
        onSelectionChange={(key) => setSelectedLibrary(key as string)}
      >
        {iconLibraries.map((library) => (
          <Tab
            key={library.key}
            title={
              <div className="flex items-center gap-2">
                <Chip color={library.color as any} size="sm" variant="dot">
                  {library.name}
                </Chip>
              </div>
            }
          >
            <div className="mt-4">
              <Card className="mb-4">
                <CardBody>
                  <p className="text-default-600">{library.description}</p>
                </CardBody>
              </Card>
              {renderIconGrid(library.key)}
            </div>
          </Tab>
        ))}
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardBody>
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">使用说明</h3>
              <p className="text-default-600">
                1. 浏览不同的图标库风格，每个库都展示了完整的字段图标映射
                <br />
                2. 点击任意图标可复制其完整名称（如 "lucide:hash"）
                <br />
                3. 选择您喜欢的风格后，我们将应用到实例信息页面
                <br />
                4. "自动重启" 字段支持点击交互演示
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">CellValue 新增交互功能</h3>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="space-y-3">
              <p className="text-default-600 text-sm">
                CellValue 组件现已支持{" "}
                <code className="bg-default-100 px-1 rounded text-xs">
                  onPress
                </code>{" "}
                属性：
              </p>

              <div className="bg-default-50 p-3 rounded-lg">
                <pre className="text-xs text-default-700 overflow-x-auto">
                  {`<CellValue
  label="自动重启"
  icon={<Icon icon="lucide:rotate-ccw" />}
  value={
    <Chip color={isEnabled ? "success" : "danger"}>
      {isEnabled ? "已启用" : "已禁用"}
    </Chip>
  }
  onPress={() => handleToggle()}
/>`}
                </pre>
              </div>

              <div className="space-y-2 text-xs text-default-600">
                <div>✅ 点击时自动添加 hover/active 效果</div>
                <div>✅ 支持键盘访问 (Enter/Space)</div>
                <div>✅ 自动设置 ARIA 属性提升无障碍性</div>
                <div>✅ 可与现有 handleRestartToggle 等函数复用</div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default IconComparisonPage;
