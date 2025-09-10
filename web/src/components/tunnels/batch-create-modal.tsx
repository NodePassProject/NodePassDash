import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Card,
  CardBody,
  Chip,
  Divider,
  Tabs,
  Tab,
  Listbox,
  ListboxItem,
  Switch
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faTrash,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';
import Editor from '@monaco-editor/react';

interface BatchCreateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface BatchItem {
  id: string;
  name: string;
  endpointId: string;
  targetAddress: string;
  targetPort: string;
  tunnelPort: string;
  type: string;
}

interface Endpoint {
  id: string;
  name: string;
}

// 转发规则接口
interface ForwardRule {
  id: string;
  name: string; // 隧道名称
  endpointId?: string; // 规则独立的入口服务器ID（当不统一时使用）
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
}

// 快速模式的规则项目
interface QuickRule {
  dest: string;
  listen_port: number;
  name: string;
}

// 批量创建请求项接口
interface BatchCreateItem {
  endpointId: number;
  inbounds_port: number;
  outbound_host: string;
  outbound_port: number;
  name: string;
}

export default function BatchCreateModal({
  isOpen,
  onOpenChange,
  onSaved
}: BatchCreateModalProps) {
  const [loading, setLoading] = useState(false);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeTab, setActiveTab] = useState('standard');
  
  // 标准模式的表单状态
  const [standardConfig, setStandardConfig] = useState({
    endpointId: '',
    unifiedEndpoint: true, // 是否统一入口服务器
    rules: [] as ForwardRule[]
  });

  // 快速模式的表单状态
  const [quickConfig, setQuickConfig] = useState({
    endpointId: '',
    rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]` // JSON格式的批量规则，设置默认内容
  });

  useEffect(() => {
    if (isOpen) {
      fetchEndpoints();
      resetForm();
    }
  }, [isOpen]);

  // 自动生成实例配置 - 只保留双端模式
  // 双端模式暂时不启用，删除相关逻辑

  const fetchEndpoints = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/endpoints/simple'));
      if (!response.ok) throw new Error('获取主控列表失败');
      const data = await response.json();
      setEndpoints(data);
    } catch (error) {
      console.error('获取主控列表失败:', error);
      addToast({
        title: '错误',
        description: '获取主控列表失败',
        color: 'danger'
      });
    }
  };

  const resetForm = () => {
    setStandardConfig({
      endpointId: '',
      unifiedEndpoint: true,
      rules: []
    });
    setQuickConfig({
      endpointId: '',
      rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]`,
    });
    setBatchItems([]);
    setActiveTab('standard');
  };

  // 解析端口范围字符串
  const parsePorts = (portsStr: string): number[] => {
    const ports: number[] = [];
    const parts = portsStr.split(',').map(p => p.trim()).filter(p => p);
    
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(p => parseInt(p.trim()));
        if (start && end && start <= end) {
          for (let i = start; i <= end; i++) {
            ports.push(i);
          }
        }
      } else {
        const port = parseInt(part);
        if (port) {
          ports.push(port);
        }
      }
    }
    
    return [...new Set(ports)].sort((a, b) => a - b); // 去重并排序
  };

  const generateSingleEndItems = () => {
    try {
      const rules = standardConfig.rules;
      
      if (rules.length === 0) {
        setBatchItems([]);
        return;
      }
      
      const items: BatchItem[] = [];
      
      for (const rule of rules) {
        items.push({
          id: `single-${Date.now()}-${rule.id}`,
          name: `批量实例-${rule.tunnelPort}`,
          endpointId: standardConfig.endpointId,
          targetAddress: rule.targetAddress,
          targetPort: rule.targetPort,
          tunnelPort: rule.tunnelPort,
          type: '服务端'
        });
      }
      
      setBatchItems(items);
    } catch (error) {
      setBatchItems([]);
    }
  };

  const generateDoubleEndItems = () => {
    // 双端模式暂时不启用，删除相关逻辑
  };

  // 重置JSON内容
  const resetJsonContent = () => {
    setQuickConfig(prev => ({ ...prev, rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]` }));
  };

  // 格式化JSON内容
  const formatJsonContent = () => {
    try {
      const content = quickConfig.rulesJson.trim();
      if (!content) return;

      // 尝试解析JSON数组
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        addToast({
          title: '格式化失败',
          description: 'JSON必须是数组格式',
          color: 'danger'
        });
        return;
      }

      const formatted = JSON.stringify(parsed, null, 2);
      setQuickConfig(prev => ({ ...prev, rulesJson: formatted }));
      addToast({
        title: '格式化成功',
        description: `已格式化 ${parsed.length} 条规则`,
        color: 'success'
      });
    } catch (error) {
      addToast({
        title: '格式化失败',
        description: 'JSON格式错误，请检查语法',
        color: 'danger'
      });
    }
  };

  // 添加新的示例规则
  const addExampleRule = () => {
    try {
      const currentContent = quickConfig.rulesJson.trim();
      let rules = [];
      
      if (currentContent) {
        rules = JSON.parse(currentContent);
        if (!Array.isArray(rules)) {
          rules = [];
        }
      }
      
      rules.push({
        dest: "127.0.0.1:3000",
        listen_port: 8080,
        name: "新规则"
      });
      
      const newContent = JSON.stringify(rules, null, 2);
      setQuickConfig(prev => ({ ...prev, rulesJson: newContent }));
    } catch (error) {
      // 如果解析失败，重置为示例
      setQuickConfig(prev => ({ ...prev, rulesJson: `[
  {
    "dest": "127.0.0.1:3000",
    "listen_port": 8080,
    "name": "新规则"
  }
]` }));
    }
  };

  const handleSubmit = async () => {
    if (activeTab === 'standard') {
      // 标准模式验证
      if (standardConfig.rules.length === 0) {
        addToast({
          title: '错误',
          description: '请添加至少一条转发规则',
          color: 'danger'
        });
        return;
      }

      // 统一入口服务器模式：检查是否选择了统一的入口服务器
      if (standardConfig.unifiedEndpoint && !standardConfig.endpointId) {
        addToast({
          title: '错误',
          description: '请选择统一的入口服务器',
          color: 'danger'
        });
        return;
      }

      // 非统一模式：检查每条规则是否都选择了入口服务器
      if (!standardConfig.unifiedEndpoint) {
        const missingEndpoint = standardConfig.rules.some(rule => !rule.endpointId);
        if (missingEndpoint) {
          addToast({
            title: '错误',
            description: '请为每条规则选择入口服务器',
            color: 'danger'
          });
          return;
        }
      }

      // 检查规则完整性（包括名称）
      const incompleteRule = standardConfig.rules.some(rule => 
        !rule.name || !rule.tunnelPort || !rule.targetAddress || !rule.targetPort
      );
      if (incompleteRule) {
        addToast({
          title: '错误',
          description: '请完善所有转发规则的配置（包括隧道名称）',
          color: 'danger'
        });
        return;
      }
    } else if (activeTab === 'quick') {
      // 快速模式验证
      if (!quickConfig.endpointId) {
        addToast({
          title: '错误',
          description: '请选择主控服务器',
          color: 'danger'
        });
        return;
      }

      if (!quickConfig.rulesJson.trim()) {
        addToast({
          title: '错误',
          description: '请输入JSON规则配置',
          color: 'danger'
        });
        return;
      }

      // 验证JSON格式
      try {
        const rules = JSON.parse(quickConfig.rulesJson.trim());
        if (!Array.isArray(rules)) {
          addToast({
            title: '错误',
            description: 'JSON必须是数组格式',
            color: 'danger'
          });
          return;
        }

        if (rules.length === 0) {
          addToast({
            title: '错误',
            description: '请输入至少一条规则',
            color: 'danger'
          });
          return;
        }

        // 验证每个规则的格式
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          if (!rule.dest || !rule.listen_port || !rule.name) {
            addToast({
              title: '错误',
              description: `第 ${i + 1} 条规则格式错误：必须包含 dest、listen_port 和 name 字段`,
              color: 'danger'
            });
            return;
          }
        }
      } catch (error) {
        addToast({
          title: '错误',
          description: 'JSON格式错误，请检查语法',
          color: 'danger'
        });
        return;
      }
    }

    setLoading(true);

    try {
      let requestBody: any;

      if (activeTab === 'standard') {
        // 标准模式：构建新的请求格式
        const standardItems = standardConfig.rules.map(rule => ({
          log: 'debug', // 默认debug
          name: rule.name,
          endpointId: parseInt(standardConfig.unifiedEndpoint ? standardConfig.endpointId : rule.endpointId!),
          tunnel_port: parseInt(rule.tunnelPort),
          target_host: rule.targetAddress,
          target_port: parseInt(rule.targetPort)
        }));

        requestBody = {
          mode: 'standard',
          standard: standardItems
        };
      } else if (activeTab === 'quick') {
        // 配置模式：构建新的请求格式
        const rules = JSON.parse(quickConfig.rulesJson.trim());
        const configItems = [{
          log: 'debug', // 默认debug
          endpointId: parseInt(quickConfig.endpointId),
          config: rules.map((rule: QuickRule) => ({
            dest: rule.dest,
            listen_port: rule.listen_port,
            name: rule.name
          }))
        }];

        requestBody = {
          mode: 'config',
          config: configItems
        };
      }

      const response = await fetch(buildApiUrl('/api/tunnels/batch-new'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.success) {
          addToast({
            title: '批量创建完成',
            description: result.message || `成功创建 ${result.successCount} 个实例`,
            color: result.failCount > 0 ? 'warning' : 'success'
          });
          
          if (onSaved) onSaved();
          onOpenChange(false);
        } else {
          addToast({
            title: '批量创建失败',
            description: result.error || '创建失败',
            color: 'danger'
          });
        }
      } else {
        throw new Error(result.error || '网络请求失败');
      }
    } catch (error) {
      console.error('批量创建失败:', error);
      addToast({
        title: '批量创建失败',
        description: error instanceof Error ? error.message : '网络错误，请稍后重试',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              批量创建实例
            </ModalHeader>

            <ModalBody>
              <Tabs 
                aria-label="批量创建类型" 
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                fullWidth={true}
              >
                <Tab
                  key="standard"
                  title="标准模式"
                >
                  <div className="space-y-6 py-4">
                    <div className="space-y-4">
                      {/* 转发规则区域 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <h5 className="text-sm font-medium text-foreground">转发规则</h5>
                            {standardConfig.unifiedEndpoint && (
                              <Select
                                placeholder="选择入口服务器"
                                selectedKeys={standardConfig.endpointId ? [standardConfig.endpointId] : []}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0] as string;
                                  setStandardConfig(prev => ({ ...prev, endpointId: selected }));
                                }}
                                size="sm"
                                className="w-48"
                                isRequired
                              >
                                {endpoints.map((endpoint) => (
                                  <SelectItem key={endpoint.id}>
                                    {endpoint.name}
                                  </SelectItem>
                                ))}
                              </Select>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                size="sm"
                                isSelected={standardConfig.unifiedEndpoint}
                                onValueChange={(checked) => {
                                  setStandardConfig(prev => ({ 
                                    ...prev, 
                                    unifiedEndpoint: checked,
                                    // 如果切换为非统一模式，清空统一的endpointId
                                    endpointId: checked ? prev.endpointId : ''
                                  }));
                                }}
                              />
                              <span className="text-sm text-default-600">统一入口服务器</span>
                            </div>
                            <Button
                              size="sm"
                              color="primary"
                              variant="flat"
                              startContent={<FontAwesomeIcon icon={faPlus} className="text-xs" />}
                              onClick={() => {
                                const newRule = {
                                  id: `rule-${Date.now()}`,
                                  name: '', // 隧道名称，用户需要填写
                                  tunnelPort: '',
                                  targetAddress: '127.0.0.1',
                                  targetPort: '',
                                  ...(standardConfig.unifiedEndpoint ? {} : { endpointId: '' })
                                };
                                setStandardConfig(prev => ({
                                  ...prev,
                                  rules: [...prev.rules, newRule]
                                }));
                              }}
                            >
                              添加规则
                            </Button>
                          </div>
                        </div>

                        {standardConfig.rules.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-default-200 rounded-lg">
                            <p className="text-default-500 text-sm">暂无转发规则，点击"添加规则"开始配置</p>
                          </div>
                        ) : (
                          <div className="max-h-80 overflow-y-auto border border-default-200 rounded-lg">
                            <Listbox 
                              aria-label="转发规则列表"
                              variant="flat"
                              selectionMode="none"
                              className="p-0"
                            >
                              {standardConfig.rules.map((rule, index) => (
                                <ListboxItem
                                  key={rule.id}
                                  textValue={`规则 ${index + 1}`}
                                  className="py-2"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-default-600 min-w-fit">
                                      #{index + 1}
                                    </span>
                                    <div className={`flex-1 grid gap-3 ${standardConfig.unifiedEndpoint ? 'grid-cols-4' : 'grid-cols-5'}`}>
                                      {/* 非统一模式时显示入口服务器选择 */}
                                      {!standardConfig.unifiedEndpoint && (
                                        <Select
                                          placeholder="选择入口服务器"
                                          selectedKeys={rule.endpointId ? [rule.endpointId] : []}
                                          onSelectionChange={(keys) => {
                                            const selected = Array.from(keys)[0] as string;
                                            setStandardConfig(prev => ({
                                              ...prev,
                                              rules: prev.rules.map(r => 
                                                r.id === rule.id ? { ...r, endpointId: selected } : r
                                              )
                                            }));
                                          }}
                                          size="sm"
                                          variant="bordered"
                                          isRequired
                                        >
                                          {endpoints.map((endpoint) => (
                                            <SelectItem key={endpoint.id}>
                                              {endpoint.name}
                                            </SelectItem>
                                          ))}
                                        </Select>
                                      )}
                                      <Input
                                        placeholder="隧道名称"
                                        value={rule.name}
                                        onValueChange={(value) => 
                                          setStandardConfig(prev => ({
                                            ...prev,
                                            rules: prev.rules.map(r => 
                                              r.id === rule.id ? { ...r, name: value } : r
                                            )
                                          }))
                                        }
                                        size="sm"
                                        variant="bordered"
                                      />
                                      <Input
                                        placeholder="入口端口，如：8000"
                                        value={rule.tunnelPort}
                                        onValueChange={(value) => 
                                          setStandardConfig(prev => ({
                                            ...prev,
                                            rules: prev.rules.map(r => 
                                              r.id === rule.id ? { ...r, tunnelPort: value } : r
                                            )
                                          }))
                                        }
                                        size="sm"
                                        variant="bordered"
                                      />
                                      <Input
                                        placeholder="目标IP，如：192.168.1.100"
                                        value={rule.targetAddress}
                                        onValueChange={(value) => 
                                          setStandardConfig(prev => ({
                                            ...prev,
                                            rules: prev.rules.map(r => 
                                              r.id === rule.id ? { ...r, targetAddress: value } : r
                                            )
                                          }))
                                        }
                                        size="sm"
                                        variant="bordered"
                                      />
                                      <Input
                                        placeholder="目标端口：10000"
                                        value={rule.targetPort}
                                        onValueChange={(value) => 
                                          setStandardConfig(prev => ({
                                            ...prev,
                                            rules: prev.rules.map(r => 
                                              r.id === rule.id ? { ...r, targetPort: value } : r
                                            )
                                          }))
                                        }
                                        size="sm"
                                        variant="bordered"
                                      />
                                    </div>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      color="danger"
                                      variant="light"
                                      onClick={() => 
                                        setStandardConfig(prev => ({
                                          ...prev,
                                          rules: prev.rules.filter(r => r.id !== rule.id)
                                        }))
                                      }
                                    >
                                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                                    </Button>
                                  </div>
                                </ListboxItem>
                              ))}
                            </Listbox>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Tab>

                <Tab
                  key="quick"
                  title="配置模式"
                >
                  <div className="space-y-6 py-4">
                    <div className="space-y-4">
                      {/* 主控选择器 */}
                      <div className="grid grid-cols-1 gap-4">
                        <Select
                          label="选择主控服务器"
                          placeholder="请选择要使用的主控服务器"
                          selectedKeys={quickConfig.endpointId ? [quickConfig.endpointId] : []}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;
                            setQuickConfig(prev => ({ ...prev, endpointId: selected }));
                          }}
                          isRequired
                        >
                          {endpoints.map((endpoint) => (
                            <SelectItem key={endpoint.id}>
                              {endpoint.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>

                      {/* JSON规则输入 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-foreground">批量规则配置</h5>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="light"
                              className="text-xs h-6 px-2 min-w-unit-12"
                              onClick={resetJsonContent}
                            >
                              复位
                            </Button>
                            <Button
                              size="sm"
                              variant="light"
                              className="text-xs h-6 px-2 min-w-unit-12"
                              onClick={formatJsonContent}
                            >
                              格式化
                            </Button>
                            <Button
                              size="sm"
                              variant="light"
                              className="text-xs h-6 px-2 min-w-unit-12"
                              onClick={addExampleRule}
                            >
                              添加示例
                            </Button>
                            <div className="text-xs text-default-500">
                              JSON格式输入
                            </div>
                          </div>
                        </div>
                        
                        <Editor
                          height="300px"
                          defaultLanguage="json"
                          theme="vs-dark"
                          value={quickConfig.rulesJson}
                          onChange={(value) => setQuickConfig(prev => ({ ...prev, rulesJson: value || '' }))}
                          options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            formatOnType: true,
                            formatOnPaste: true,
                            tabSize: 2,
                            wordWrap: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            bracketPairColorization: { enabled: true }
                          }}
                        />
                        
                        {/* 格式说明 */}
                        <div className="bg-default-50 rounded-lg p-4">
                          <h6 className="text-sm font-medium text-default-700 mb-2">格式说明：</h6>
                          <ul className="text-xs text-default-600 space-y-1">
                            <li>• <code className="bg-default-100 px-1 rounded">dest</code>: 目标地址，格式为 "IP:端口"</li>
                            <li>• <code className="bg-default-100 px-1 rounded">listen_port</code>: 监听端口号</li>
                            <li>• <code className="bg-default-100 px-1 rounded">name</code>: 隧道名称</li>
                            <li>• 输入JSON数组格式，支持多条规则批量创建</li>
                          </ul>
                        </div>

                        {/* JSON验证提示 */}
                        {quickConfig.rulesJson && (
                          <div className="text-xs">
                            {(() => {
                              try {
                                const rules = JSON.parse(quickConfig.rulesJson.trim());
                                if (!Array.isArray(rules)) {
                                  return (
                                    <div className="text-danger-600 flex items-center gap-1">
                                      <span>✗</span>
                                      <span>必须是JSON数组格式</span>
                                    </div>
                                  );
                                }
                                
                                const validCount = rules.filter((rule: any) => 
                                  rule.dest && rule.listen_port && rule.name
                                ).length;
                                
                                if (validCount === rules.length && rules.length > 0) {
                                  return (
                                    <div className="text-success-600 flex items-center gap-1">
                                      <span>✓</span>
                                      <span>检测到 {validCount} 条有效规则</span>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="text-warning-600 flex items-center gap-1">
                                      <span>⚠</span>
                                      <span>有效规则：{validCount} / {rules.length}</span>
                                    </div>
                                  );
                                }
                              } catch {
                                return (
                                  <div className="text-danger-600 flex items-center gap-1">
                                    <span>✗</span>
                                    <span>JSON格式错误</span>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Tab>
              </Tabs>
            </ModalBody>

            <ModalFooter>
              <Button 
                color="danger" 
                variant="light" 
                onPress={onClose}
                isDisabled={loading}
              >
                取消
              </Button>
              <Button 
                color="primary" 
                onPress={handleSubmit}
                isLoading={loading}
                isDisabled={
                  activeTab === 'standard' 
                    ? (
                        standardConfig.rules.length === 0 ||
                        (standardConfig.unifiedEndpoint && !standardConfig.endpointId) ||
                        (!standardConfig.unifiedEndpoint && standardConfig.rules.some(rule => !rule.endpointId)) ||
                        standardConfig.rules.some(rule => !rule.name || !rule.tunnelPort || !rule.targetAddress || !rule.targetPort)
                      )
                    : activeTab === 'quick'
                      ? (!quickConfig.endpointId || !quickConfig.rulesJson.trim())
                      : true
                }
                startContent={!loading ? <FontAwesomeIcon icon={faCopy} /> : null}
              >
                {loading 
                  ? '创建中...' 
                  : activeTab === 'standard' 
                    ? `批量创建 (${standardConfig.rules.length})` 
                    : activeTab === 'quick'
                      ? (() => {
                          try {
                            const rules = JSON.parse(quickConfig.rulesJson.trim());
                            return Array.isArray(rules) ? `批量创建 (${rules.length})` : '批量创建';
                          } catch {
                            return '批量创建';
                          }
                        })()
                      : '批量创建'
                }
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 