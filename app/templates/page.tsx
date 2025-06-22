"use client";

import React from "react";
import {
  Card,
  CardBody,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { buildApiUrl } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { 
  faLayerGroup,
  faPlus,
  faArrowRight,
  faShield,
  faWifi,
  faServer,
  faChevronRight,
  faEye,
  faEyeSlash,
  faArrowsLeftRight,
  faGear,
  faUser,
  faDesktop,
  faCloud,
  faBullseye,
  faHdd,
  faNetworkWired,
  faArrowDown,
  faExchangeAlt,
  faGlobe,
} from "@fortawesome/free-solid-svg-icons";

interface SimpleEndpoint {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  status: 'ONLINE' | 'OFFLINE' | 'FAIL';
  tunnelCount: number;
}

interface TunnelMode {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
}

interface FormData {
  userPort: string;
  masterServer: string;
  listenType: string; // 监听类型：local/external
  targetIp: string;
  targetPort: string;
  targetMaster: string;
  targetMasterPort: string;
  tlsLevel: string;
  logLevel: string;
  connectionPort: string;
  accessInfo: string;
  intranetTargetMaster: string; // 内网穿透的目标服务器
  intranetTargetPort: string; // 内网穿透的目标端口
  intranetExitIp: string; // 内网穿透的出口IP
  certPath: string; // TLS 2 证书路径
  keyPath: string; // TLS 2 密钥路径
}

interface TemplateCreateRequest {
  log: string;
  listen_port: number;
  mode: string;
  tls?: number;
  cert_path?: string;
  key_path?: string;
  inbounds?: {
    target_host: string;
    target_port: number;
    master_id: number;
    type: string;
  };
  outbounds?: {
    target_host: string;
    target_port: number;
    master_id: number;
    type: string;
  };
}

interface FormField {
  label: string;
  key: keyof FormData;
  placeholder: string;
  value: string;
  type?: string;
  options?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
}

interface NodeConfig {
  label: string;
  type: 'user' | 'relay' | 'target';
  formFields: FormField[];
}

export default function TemplatesPage() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<string>('single');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [endpoints, setEndpoints] = useState<SimpleEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // 获取端点列表
  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/endpoints/simple?excludeFailed=true'));
      if (!response.ok) throw new Error('获取端点列表失败');
      const data = await response.json();
      setEndpoints(data || []);
    } catch (error) {
      console.error('获取端点列表失败:', error);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const tlsLevels = [
    { value: '0', label: 'TLS 0 - 无加密 (最快速)' },
    { value: '1', label: 'TLS 1 - 自签名证书' },
    { value: '2', label: 'TLS 2 - 自定义证书' }
  ];

  const logLevels = [
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warning' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' }
  ];

  const listenTypes = [
    { value: 'external', label: '对外' },
    { value: 'local', label: '本地' }
  ];

  const [formData, setFormData] = useState<FormData>({
    userPort: '',
    masterServer: '',
    listenType: 'external', // 默认对外监听
    targetIp: '',
    targetPort: '',
    targetMaster: '',
    targetMasterPort: '',
    tlsLevel: '1',
    logLevel: 'debug', // 默认debug级别
    connectionPort: '',
    accessInfo: '',
    intranetTargetMaster: '',
    intranetTargetPort: '',
    intranetExitIp: '',
    certPath: '',
    keyPath: ''
  });

  // 当监听类型改变时，自动设置目标IP
  useEffect(() => {
    if (formData.listenType === 'local') {
      setFormData(prev => ({ ...prev, targetIp: '127.0.0.1' }));
    } else if (formData.listenType === 'external' && formData.targetIp === '127.0.0.1') {
      setFormData(prev => ({ ...prev, targetIp: '' }));
    }
  }, [formData.listenType]);

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // 清空表单数据的函数
  const resetFormData = () => {
    setFormData({
      userPort: '',
      masterServer: '',
      listenType: 'external', // 保持默认值
      targetIp: '',
      targetPort: '',
      targetMaster: '',
      targetMasterPort: '',
      tlsLevel: '1', // 保持默认值
      logLevel: 'debug', // 保持默认值
      connectionPort: '',
      accessInfo: '',
      intranetTargetMaster: '',
      intranetTargetPort: '',
      intranetExitIp: '',
      certPath: '',
      keyPath: ''
    });
  };

  // 切换隧道模式时清空表单数据
  const handleModeChange = (mode: string) => {
    setSelectedMode(mode);
    resetFormData();
  };

  // 从URL中提取IP/域名
  const extractHostFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      // 如果URL解析失败，尝试手动提取
      const match = url.match(/:\/\/([^\/\:]+)/);
      return match ? match[1] : url;
    }
  };

  const tunnelModes: TunnelMode[] = [
    {
      id: 'single',
      title: '单端转发',
      description: '简单的端口转发，适用于基本的隧道需求',
      icon: faArrowRight,
      color: 'primary'
    },
    {
      id: 'double',
      title: '双端转发',
      description: '双端加密隧道，提供更高的安全性和灵活性',
      icon: faExchangeAlt,
      color: 'success'
    },
    {
      id: 'intranet',
      title: '内网穿透',
      description: '穿透NAT和防火墙，实现内网服务对外访问',
      icon: faGlobe,
      color: 'secondary'
    }
  ];

  const renderModeSelector = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faLayerGroup} className="text-2xl text-primary" />
          <h2 className="text-2xl font-bold">选择应用模式</h2>
        </div>
        <Button
            variant="flat"
            onClick={() => router.back()}
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
          >
            返回
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tunnelModes.map((mode) => (
          <Card
            key={mode.id}
            isPressable
            isHoverable
            onPress={() => handleModeChange(mode.id)}
            className={`cursor-pointer transition-all duration-200 ${
              selectedMode === mode.id
                ? 'ring-2 ring-primary ring-offset-2'
                : ''
            }`}
          >
                         <CardBody className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                 mode.color === 'primary' ? 'bg-primary bg-opacity-10' :
                 mode.color === 'success' ? 'bg-success bg-opacity-10' :
                 mode.color === 'secondary' ? 'bg-secondary bg-opacity-10' : 'bg-default bg-opacity-10'
               }`}>
                 <FontAwesomeIcon icon={mode.icon} className={`text-xl ${
                   mode.color === 'primary' ? 'text-primary' :
                   mode.color === 'success' ? 'text-success' :
                   mode.color === 'secondary' ? 'text-secondary' : 'text-default'
                 }`} />
               </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{mode.title}</h3>
              <p className="text-default-500 text-sm">{mode.description}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );

  const getFlowConfig = (): NodeConfig[] => {
    switch (selectedMode) {
      case 'single':
        return [
          {
            label: '用户',
            type: 'user',
            formFields: [
              {
                label: '访问端口',
                key: 'userPort',
                placeholder: '8080',
                value: formData.userPort
              }
            ]
          },
          {
            label: '中转机器[client]',
            type: 'relay',
            formFields: [
              {
                label: '连接服务器',
                key: 'masterServer',
                type: 'select',
                placeholder: '下拉选择',
                value: formData.masterServer,
                options: endpoints.map(endpoint => ({
                  value: endpoint.name,
                  label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                  disabled: endpoint.status === 'FAIL'
                }))
              },
              {
                label: '监听',
                key: 'listenType',
                type: 'select',
                placeholder: '选择监听类型',
                value: formData.listenType,
                options: listenTypes.map(type => ({
                  value: type.value,
                  label: type.label
                }))
              }
            ]
          },
          {
            label: '最终目的地',
            type: 'target',
            formFields: [
              // 只有对外监听时才显示目标IP字段
              ...(formData.listenType === 'external' ? [{
                label: '目标IP',
                key: 'targetIp' as keyof FormData,
                placeholder: '192.168.1.100 / 2001:db8::1',
                value: formData.targetIp
              }] : []),
              {
                label: '目标端口',
                key: 'targetPort',
                placeholder: '3306',
                value: formData.targetPort
              }
            ]
          }
        ];
      
      case 'double':
        return [
          {
            label: '用户',
            type: 'user',
            formFields: [
              {
                label: '访问端口',
                key: 'userPort',
                placeholder: '8080',
                value: formData.userPort
              }
            ]
          },
          {
            label: '入口机器[server]',
            type: 'relay',
            formFields: [
              {
                label: '连接服务器',
                key: 'masterServer',
                type: 'select',
                placeholder: '下拉选择',
                value: formData.masterServer,
                options: endpoints.map(endpoint => ({
                  value: endpoint.name,
                  label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                  disabled: endpoint.status === 'FAIL'
                }))
              }
            ]
          },
          {
            label: '出口机器[client]',
            type: 'target',
            formFields: [
              {
                label: '连接服务器',
                key: 'targetMaster',
                type: 'select',
                placeholder: '下拉选择',
                value: formData.targetMaster,
                options: endpoints.map(endpoint => ({
                  value: endpoint.name,
                  label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                  disabled: endpoint.status === 'FAIL'
                }))
              },
              {
                label: '出口端口',
                key: 'targetMasterPort',
                placeholder: '3306',
                value: formData.targetMasterPort
              }
            ]
          }
        ];
      
      case 'intranet':
        return [
          {
            label: '用户',
            type: 'user',
            formFields: [
              {
                label: '访问端口',
                key: 'userPort',
                placeholder: '8080',
                value: formData.userPort
              }
            ]
          },
          {
            label: '中转机器[server]',
            type: 'relay',
            formFields: [
              {
                label: '连接服务器',
                key: 'masterServer',
                type: 'select',
                placeholder: '下拉选择',
                value: formData.masterServer,
                options: endpoints.map(endpoint => ({
                  value: endpoint.name,
                  label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                  disabled: endpoint.status === 'FAIL'
                }))
              }
            ]
          },
          {
            label: '内网服务[client]',
            type: 'target',
            formFields: [
              {
                label: '连接服务器',
                key: 'intranetTargetMaster',
                type: 'select',
                placeholder: '下拉选择',
                value: formData.intranetTargetMaster,
                options: endpoints.map(endpoint => ({
                  value: endpoint.name,
                  label: `${endpoint.name} [${extractHostFromUrl(endpoint.url)}]${endpoint.status === 'FAIL' ? ' - 异常' : ''}`,
                  disabled: endpoint.status === 'FAIL'
                }))
              },
              {
                label: '服务IP',
                key: 'intranetExitIp',
                placeholder: '服务的IP',
                value: formData.intranetExitIp
              },
              {
                label: '服务端口',
                key: 'intranetTargetPort',
                placeholder: '3306',
                value: formData.intranetTargetPort
              }
            ]
          }
        ];
      
      default:
        return [];
    }
  };



  const renderNodeWithForm = (nodeConfig: NodeConfig, index: number, isLast: boolean) => {
    const { label, type, formFields } = nodeConfig;
    
    const getNodeColor = () => {
      switch (type) {
        case 'user': return 'primary';
        case 'relay': return 'warning';
        case 'target': return 'success';
        default: return 'default';
      }
    };

    const getNodeBgClass = () => {
      switch (type) {
        case 'user': return 'bg-blue-100 border-blue-300';
        case 'relay': return 'bg-yellow-100 border-yellow-300';
        case 'target': 
          // 单端转发时，目标节点使用与中转机器相同的颜色
          return selectedMode === 'single' ? 'bg-yellow-100 border-yellow-300' : 'bg-green-100 border-green-300';
        default: return 'bg-gray-100 border-gray-300';
      }
    };

    const getNodeTextClass = () => {
      switch (type) {
        case 'user': return 'text-blue-600';
        case 'relay': return 'text-yellow-600';
        case 'target': 
          // 单端转发时，目标节点使用与中转机器相同的颜色
          return selectedMode === 'single' ? 'text-yellow-600' : 'text-green-600';
        default: return 'text-gray-600';
      }
    };

    const getNodeIcon = () => {
      // 保持用户端图标不变，统一其他机器图标为服务器图标
      if (type === 'user') {
          return faUser;
      }
      // 所有机器（relay和target）都使用服务器图标
      return faServer;
    };

    return (
      <div className="flex flex-col items-center w-full">
        {/* 节点图标 - 顶部对齐 */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md border-2 ${getNodeBgClass()}`}>
            <FontAwesomeIcon 
              icon={getNodeIcon()} 
            className={`text-xl ${getNodeTextClass()}`} 
            />
          </div>
          
        {/* 节点标题 - 居中对齐icon */}
        <div className="mt-2 mb-4 text-center">
          <div className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
            type === 'user' ? 'bg-blue-500 text-white' :
            type === 'relay' ? 'bg-yellow-500 text-white' :
            type === 'target' ? (selectedMode === 'single' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white') : 'bg-gray-500 text-white'
          }`}>
              {label}
          </div>
          </div>
          
        {/* 节点表单 - 垂直居中对齐icon，宽度相等，顶部对齐 */}
        <div className="w-full max-w-[280px] bg-default-50/80 dark:bg-default-100/20 border border-default-200 dark:border-default-300/30 rounded-lg shadow-sm p-3">
          <div className="space-y-3">
              {formFields.map((field, fieldIndex) => (
                <div key={fieldIndex}>
                <label className="block text-xs font-medium text-default-700 dark:text-default-700 mb-1">
                  {field.label}
                </label>
                
                  {field.type === 'select' ? (
                  <select
                    value={field.value}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-700 dark:text-black focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">{field.placeholder}</option>
                      {field.options?.map((option) => (
                      <option 
                          key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        >
                          {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                      type={field.type === 'readonly' ? 'text' : (field.type || 'text')}
                      placeholder={field.placeholder}
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                    readOnly={field.key === 'accessInfo' || field.type === 'readonly'}
                    className={`w-full px-2 py-1.5 text-sm border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-700 dark:text-black placeholder-default-400 dark:placeholder-default-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                      field.key === 'accessInfo' || field.type === 'readonly' 
                        ? 'bg-default-100 dark:bg-default-800/50 cursor-not-allowed' 
                        : ''
                    }`}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFlowDiagram = () => {
    const flowConfig = getFlowConfig();

    return (
      <Card className="bg-gradient-to-br from-default-50 to-default-100/50">
        <CardBody className="p-4 md:p-8">
          
          {/* 重新设计的布局 */}
          <div className="w-full max-w-6xl mx-auto">
            {/* 主要容器：三列等宽布局 */}
            <div className="grid grid-cols-5 gap-0 items-start">
              
              {/* 第一个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[0], 0, false)}
              </div>
              
                             {/* 第一个箭头 */}
               <div className="col-span-1 flex flex-col items-center pt-8">
                 <div className="text-xs text-default-500 mb-2">
                   {selectedMode === 'single' ? '访问' : 
                    selectedMode === 'double' ? '访问' :
                    selectedMode === 'intranet' ? '访问' : '连接'}
                 </div>
                 <svg width="120" height="14" viewBox="0 0 120 14" className="text-blue-600">
                   {/* 双向箭头横线 */}
                   <line x1="10" y1="7" x2="110" y2="7" stroke="currentColor" strokeWidth="2"/>
                   
                   {/* 左箭头 */}
                   <polygon points="10,7 18,4 18,10" fill="currentColor"/>
                   
                   {/* 右箭头 */}
                   <polygon points="110,7 102,4 102,10" fill="currentColor"/>
                 </svg>
               </div>
              
              {/* 第二个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[1], 1, false)}
              </div>
              
                             {/* 第二个箭头 */}
               <div className="col-span-1 flex flex-col items-center pt-8">
                 <div className="text-xs text-default-500 mb-2">
                   {selectedMode === 'single' ? '转发' : 
                    selectedMode === 'double' ? '转发' :
                    selectedMode === 'intranet' ? '暴露' : '连接'}
                 </div>
                 <svg width="120" height="14" viewBox="0 0 120 14" className="text-blue-600">
                   {/* 双向箭头横线 */}
                   <line x1="10" y1="7" x2="110" y2="7" stroke="currentColor" strokeWidth="2"/>
                   
                   {/* 左箭头 */}
                   <polygon points="10,7 18,4 18,10" fill="currentColor"/>
                   
                   {/* 右箭头 */}
                   <polygon points="110,7 102,4 102,10" fill="currentColor"/>
                 </svg>
                 
                 {/* 双端转发和内网穿透的连接池配置 */}
                 {(selectedMode === 'double' || selectedMode === 'intranet') && (
                   <div className="bg-primary-50 dark:bg-primary-100/20 border-2 border-primary-200 dark:border-primary-300/30 rounded-lg p-2 shadow-sm mt-2" style={{ width: '120px' }}>
                     <div className="flex items-center gap-1 mb-2">
                       <FontAwesomeIcon icon={faGear} className="text-primary-600 dark:text-primary-400 text-xs" />
                       <span className="text-xs font-medium text-primary-800 dark:text-primary-300">
                         {selectedMode === 'double' ? '连接配置' : '连接配置'}
                       </span>
                     </div>
                     <div className="space-y-1">
                       <div>
                         <label className="block text-xs text-default-700 dark:text-default-200 mb-1">
                           {selectedMode === 'double' ? '连接端口' : '连接端口'}
                         </label>
                         <input
                           type="text"
                           value={formData.connectionPort}
                           onChange={(e) => updateField('connectionPort', e.target.value)}
                           placeholder="10101"
                           className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-black placeholder-default-400 dark:placeholder-default-500"
                         />
                       </div>
                       
                       <div>
                         <label className="block text-xs text-default-700 dark:text-default-200 mb-1">TLS</label>
                         <select 
                           value={formData.tlsLevel}
                           onChange={(e) => updateField('tlsLevel', e.target.value)}
                           className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-black"
                         >
                           {tlsLevels.map((level) => (
                             <option key={level.value} value={level.value}>
                               TLS {level.value}
                             </option>
                           ))}
                         </select>
                       </div>
                       
                       {/* TLS 2 的证书配置 */}
                       {formData.tlsLevel === '2' && (
                         <>
                           <div>
                             <label className="block text-xs text-default-700 dark:text-default-200 mb-1">证书路径</label>
                             <input
                               type="text"
                               value={formData.certPath}
                               onChange={(e) => updateField('certPath', e.target.value)}
                               placeholder="/path/to/cert.pem"
                               className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-white placeholder-default-400 dark:placeholder-default-500"
                             />
                           </div>
                           <div>
                             <label className="block text-xs text-default-700 dark:text-default-200 mb-1">密钥路径</label>
                             <input
                               type="text"
                               value={formData.keyPath}
                               onChange={(e) => updateField('keyPath', e.target.value)}
                               placeholder="/path/to/key.pem"
                               className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-white placeholder-default-400 dark:placeholder-default-500"
                             />
                           </div>
                         </>
                       )}
                     </div>
                   </div>
                 )}
               </div>
              
              {/* 第三个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[2], 2, true)}
              </div>
              
            </div>
          </div>
          
          {/* 场景说明 */}
                     <div className="mt-6 text-center">
             <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 rounded-full text-sm text-default-600">
               <FontAwesomeIcon icon={faArrowsLeftRight} className="text-primary" />
               {selectedMode === 'single' && (
                 formData.listenType === 'local' 
                   ? '用户可以访问本地端口来访问127.0.0.1的目标服务'
                   : '用户可以访问指定端口来访问目标IP的服务'
               )}
              {selectedMode === 'double' && '用户可以访问本地端口，通过双端加密隧道连接到目标服务'}
               {selectedMode === 'intranet' && '用户可以通过公网端口访问内网服务，实现内网穿透'}
             </div>
           </div>
        </CardBody>
      </Card>
    );
  };

  const renderAdditionalInfo = () => {
    const infoConfig = {
      single: {
        color: 'primary',
        title: '单端转发说明',
        content: '单端转发模式适用于简单的端口转发需求，用户连接到指定端口，流量通过中转机器转发到目标服务。'
      },
      double: {
        color: 'success',
        title: '双端转发说明',
        content: '双端转发提供端到端的加密隧道，支持TLS加密和详细的日志记录，适用于需要高安全性的场景。'
      },
      intranet: {
        color: 'secondary',
        title: '内网穿透说明',
        content: '内网穿透将您的内网服务通过中转服务器暴露到公网，外部用户可以通过公网地址访问您的内网服务。'
      }
    };

    const info = infoConfig[selectedMode as keyof typeof infoConfig];
    if (!info) return null;

    return (
      <Card>
        <CardBody className="p-4">
          <h4 className={`font-medium mb-2 ${
            info.color === 'primary' ? 'text-primary' :
            info.color === 'success' ? 'text-success' :
            info.color === 'secondary' ? 'text-secondary' : 'text-default'
          }`}>{info.title}</h4>
          <p className="text-default-600 text-sm">{info.content}</p>
        </CardBody>
      </Card>
    );
  };

  const generateCommand = () => {
    switch (selectedMode) {
      case 'single':
        // 根据监听类型使用不同的目标IP
        const targetIp = formData.listenType === 'local' ? '127.0.0.1' : (formData.targetIp || '127.0.0.1');
        return `nodepass "server://:${formData.userPort}/${targetIp}:${formData.targetPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}"`;
      case 'double':
        return `nodepass "server://:${formData.userPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}" && nodepass "client://${formData.masterServer}:${formData.connectionPort}/${formData.targetMaster}:${formData.targetMasterPort}"`;
      case 'intranet':
        return `nodepass "client://${formData.masterServer}:10101/127.0.0.1:${formData.userPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}"`;
      default:
        return '';
    }
  };

  // 构建模板创建请求
  const buildTemplateRequest = (): TemplateCreateRequest | null => {
    const getEndpointIdByName = (name: string): number => {
      const endpoint = endpoints.find(ep => ep.name === name);
      return endpoint ? endpoint.id : 0;
    };

    switch (selectedMode) {
      case 'single':
        if (!formData.userPort || !formData.masterServer || !formData.targetPort) {
          return null;
        }
        
        const targetHost = formData.listenType === 'local' ? '127.0.0.1' : (formData.targetIp || '127.0.0.1');
        
        return {
          log: formData.logLevel,
          listen_port: parseInt(formData.userPort),
          mode: 'single',
          inbounds: {
            target_host: targetHost,
            target_port: parseInt(formData.targetPort),
            master_id: getEndpointIdByName(formData.masterServer),
            type: 'client'
          }
        };

      case 'double':
        if (!formData.userPort || !formData.masterServer || !formData.targetMaster || !formData.targetMasterPort || !formData.connectionPort) {
          return null;
        }

        const doubleRequest: TemplateCreateRequest = {
          log: formData.logLevel,
          listen_port: parseInt(formData.connectionPort),
          mode: 'bothway',
          tls: parseInt(formData.tlsLevel),
          inbounds: {
            target_host: '',
            target_port: parseInt(formData.userPort),
            master_id: getEndpointIdByName(formData.masterServer),
            type: 'server'
          },
          outbounds: {
            target_host: '',
            target_port: parseInt(formData.targetMasterPort),
            master_id: getEndpointIdByName(formData.targetMaster),
            type: 'client'
          }
        };

        // 如果是TLS 2，添加证书路径
        if (formData.tlsLevel === '2') {
          doubleRequest.cert_path = formData.certPath;
          doubleRequest.key_path = formData.keyPath;
        }

        return doubleRequest;

      case 'intranet':
        if (!formData.userPort || !formData.masterServer || !formData.intranetTargetMaster || !formData.intranetTargetPort || !formData.connectionPort) {
          return null;
        }

        return {
          log: formData.logLevel,
          listen_port: parseInt(formData.connectionPort),
          mode: 'intranet',
          tls: parseInt(formData.tlsLevel),
          inbounds: {
            target_host: '',
            target_port: parseInt(formData.userPort),
            master_id: getEndpointIdByName(formData.masterServer),
            type: 'server'
          },
          outbounds: {
            target_host: formData.intranetExitIp || '127.0.0.1',
            target_port: parseInt(formData.intranetTargetPort),
            master_id: getEndpointIdByName(formData.intranetTargetMaster),
            type: 'client'
          }
        };

      default:
        return null;
    }
  };

  // 处理创建应用
  const handleCreateApplication = async () => {
    const requestData = buildTemplateRequest();
    if (!requestData) {
      addToast({
        title: '表单验证失败',
        description: '请填写完整的表单信息',
        color: 'warning'
      });
      return;
    }

    setCreating(true);
    
    // 显示进度提示
    addToast({
      timeout: 1,
      title: '正在创建场景中...',
      description: selectedMode === 'bothway' ? '正在创建场景中，请稍候' : '正在创建场景中，请稍候',
      color: 'primary'
    });

    try {
      const response = await fetch(buildApiUrl('/api/tunnels/template'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: '创建成功！',
          description: result.message || '隧道已成功创建',
          color: 'success'
        });
        
        // 延迟跳转到隧道列表页面
        setTimeout(() => {
          router.push('/tunnels');
        }, 1500);
      } else {
        throw new Error(result.error || '创建失败');
      }
    } catch (error) {
      console.error('创建隧道失败:', error);
      addToast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '未知错误',
        color: 'danger'
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      {/* <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4">
          <div>
            <h1 className="text-2xl font-bold">NodePass 隧道模板创建器</h1>
            <p className="text-default-500 text-sm">使用预定义模板快速创建和配置NodePass隧道连接</p>
          </div>
        </div>
      </div> */}

      {renderModeSelector()}

      {selectedMode && (
        <div className="space-y-6">
          {renderFlowDiagram()}
          
          {renderAdditionalInfo()}
          
          <div className="flex gap-4">
            <Button 
              color="primary"
              startContent={creating ? undefined : <FontAwesomeIcon icon={faPlus} />}
              onClick={handleCreateApplication}
              isLoading={creating}
              isDisabled={creating}
            >
              {creating ? '创建中...' : '创建应用'}
            </Button>
          </div>
          
          {showPreview && (
            <Card className="bg-default-900 dark:bg-default-100/10">
              <CardBody className="p-4">
                <div className="text-default-400 dark:text-default-500 text-sm mb-2"># 生成的NodePass命令:</div>
                <div className="text-success-400 dark:text-success-300 font-mono text-sm break-all">{generateCommand()}</div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
} 