'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardBody, 
  Button, 
  Spinner, 
  Chip, 
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Divider,
  ScrollShadow,
  Progress
} from '@heroui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDownload, 
  faExternalLinkAlt, 
  faRocket, 
  faSync,
  faTerminal,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface VersionInfo {
  current: string;
  goVersion: string;
  os: string;
  arch: string;
  buildTime?: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

interface UpdateInfo {
  current: VersionInfo;
  latest?: GitHubRelease;
  hasUpdate: boolean;
  updateContent?: string;
}

interface DeploymentInfo {
  method: string;
  canUpdate: boolean;
  updateInfo: string;
  hasDockerPerm: boolean;
  environment: string;
  details: string;
  debugInfo: any;
}

interface UpdateLog {
  level: string;
  message: string;
  timestamp: string;
}

export default function VersionSettings() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<UpdateLog[]>([]);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateComplete, setUpdateComplete] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { 
    isOpen: isUpdateModalOpen, 
    onOpen: onUpdateModalOpen, 
    onClose: onUpdateModalClose 
  } = useDisclosure();

  // 获取当前版本和部署信息
  const fetchVersionData = async () => {
    try {
      setLoading(true);
      const [versionRes, deploymentRes] = await Promise.all([
        fetch('/api/version/current'),
        fetch('/api/version/deployment-info')
      ]);

      if (versionRes.ok) {
        const versionData = await versionRes.json();
        setUpdateInfo({
          current: versionData.data,
          hasUpdate: false
        });
      }

      if (deploymentRes.ok) {
        const deploymentData = await deploymentRes.json();
        setDeploymentInfo(deploymentData.data);
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检查更新
  const checkUpdate = async () => {
    try {
      setChecking(true);
      const response = await fetch('/api/version/check-update');
      if (response.ok) {
        const data = await response.json();
        setUpdateInfo(data.data);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
    } finally {
      setChecking(false);
    }
  };

  // 连接 SSE 监听更新日志
  const connectUpdateSSE = () => {
    const es = new EventSource('/api/sse/global');
    
    es.onopen = () => {
      console.log('更新日志 SSE 连接已建立');
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update_log') {
          const logEntry: UpdateLog = data.data;
          setUpdateLogs(prev => [...prev, logEntry]);
          
          // 更智能的进度更新逻辑
          if (logEntry.level === 'success') {
            const message = logEntry.message.toLowerCase();
            
            // 根据具体的成功消息来更新进度
            if (message.includes('备份完成')) {
              setUpdateProgress(15);
            } else if (message.includes('下载进度: 10%')) {
              setUpdateProgress(20);
            } else if (message.includes('下载进度: 20%')) {
              setUpdateProgress(30);
            } else if (message.includes('下载进度: 30%')) {
              setUpdateProgress(40);
            } else if (message.includes('下载进度: 40%')) {
              setUpdateProgress(50);
            } else if (message.includes('下载进度: 50%')) {
              setUpdateProgress(60);
            } else if (message.includes('下载进度: 60%')) {
              setUpdateProgress(65);
            } else if (message.includes('下载进度: 70%')) {
              setUpdateProgress(70);
            } else if (message.includes('下载进度: 80%')) {
              setUpdateProgress(75);
            } else if (message.includes('下载进度: 90%')) {
              setUpdateProgress(80);
            } else if (message.includes('下载完成')) {
              setUpdateProgress(82);
            } else if (message.includes('程序文件更新成功')) {
              setUpdateProgress(85);
            } else if (message.includes('已删除旧的前端资源目录')) {
              setUpdateProgress(90);
            } else if (message.includes('镜像拉取成功')) {
              // Docker 更新进度
              setUpdateProgress(70);
            } else if (message.includes('容器重启成功')) {
              setUpdateProgress(90);
            } else {
              // 其他成功消息，适度增加进度
              setUpdateProgress(prev => Math.min(prev + 3, 88));
            }
          } else if (logEntry.level === 'complete') {
            setUpdateProgress(100);
            setUpdateComplete(true);
            // 5秒后关闭连接
            setTimeout(() => {
              es.close();
              setEventSource(null);
            }, 5000);
          } else if (logEntry.level === 'info') {
            // 信息级别消息，小幅增加进度
            const message = logEntry.message.toLowerCase();
            if (message.includes('开始执行自动更新')) {
              setUpdateProgress(5);
            } else if (message.includes('最新版本:')) {
              setUpdateProgress(10);
            }
          }
        }
      } catch (error) {
        console.error('解析更新日志失败:', error);
      }
    };

    es.onerror = (error) => {
      console.error('更新日志 SSE 连接错误:', error);
      es.close();
      setEventSource(null);
    };

    setEventSource(es);
  };

  // 执行更新
  const performUpdate = async () => {
    try {
      setUpdating(true);
      setUpdateLogs([]);
      setUpdateProgress(0);
      setUpdateComplete(false);
      onUpdateModalOpen();
      
      // 连接 SSE 监听更新日志
      connectUpdateSSE();

      const response = await fetch('/api/version/auto-update', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUpdateLogs(prev => [...prev, {
            level: 'info',
            message: data.message,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } else {
        const errorData = await response.json();
        setUpdateLogs(prev => [...prev, {
          level: 'error',
          message: errorData.error || '更新失败',
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    } catch (error) {
      console.error('执行更新失败:', error);
      setUpdateLogs(prev => [...prev, {
        level: 'error',
        message: `更新失败: ${error}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setUpdating(false);
    }
  };

  // 关闭更新模态框
  const handleUpdateModalClose = () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    onUpdateModalClose();
    setUpdateLogs([]);
    setUpdateProgress(0);
    setUpdateComplete(false);
  };

  // 获取日志图标
  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return faCheckCircle;
      case 'error':
        return faExclamationTriangle;
      case 'warning':
        return faExclamationTriangle;
      case 'complete':
        return faCheckCircle;
      default:
        return faInfoCircle;
    }
  };

  // 获取日志颜色
  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
      case 'complete':
        return 'text-success';
      case 'error':
        return 'text-danger';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-default-600';
    }
  };

  useEffect(() => {
    fetchVersionData();
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Card className="mb-6">
        <CardBody className="space-y-6">
          <div className="space-y-4">
            {/* 当前版本信息 */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-medium">版本号</span>
                  <Chip variant="flat" color="primary">
                    当前: {updateInfo?.current.current || 'unknown'}
                  </Chip>
                  {updateInfo?.hasUpdate && updateInfo.latest && (
                    <Chip 
                      variant="flat" 
                      color="success"
                      className="cursor-pointer hover:opacity-80"
                      onClick={onOpen}
                    >
                      最新: {updateInfo.latest.tag_name}
                    </Chip>
                  )}
                </div>
                
                {/* 环境信息 */}
                <div className="flex items-center gap-4 text-sm text-default-600">
                  <span>操作系统: {updateInfo?.current.os}</span>
                  <span>架构: {updateInfo?.current.arch}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="bordered"
                  size="sm"
                  onPress={checkUpdate}
                  isLoading={checking}
                  startContent={<FontAwesomeIcon icon={faSync} />}
                >
                  检查更新
                </Button>
              </div>
            </div>

            <Divider />

            {/* 部署方式信息 */}
            {deploymentInfo && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">部署方式</span>
                      <Chip variant="flat" size="sm">
                        {deploymentInfo.method === 'docker' ? 'Docker 容器' : 
                         deploymentInfo.method === 'binary' ? '二进制文件' : '未知'}
                      </Chip>
                    </div>
                    <p className="text-sm text-default-600">{deploymentInfo.details}</p>
                  </div>

                  {/* 一键更新按钮 */}
                  {deploymentInfo.canUpdate && updateInfo?.hasUpdate && (
                    <Button
                      color="primary"
                      size="sm"
                      onPress={performUpdate}
                      isLoading={updating}
                      startContent={<FontAwesomeIcon icon={faRocket} />}
                    >
                      立即更新
                    </Button>
                  )}
                </div>

                {/* 调试信息按钮（仅Docker环境且无权限时显示） */}
                {deploymentInfo.method === 'docker' && !deploymentInfo.hasDockerPerm && (
                  <Button
                    variant="flat"
                    size="sm"
                    color="warning"
                    onPress={() => {
                      console.log('调试信息:', deploymentInfo.debugInfo);
                      // TODO: 显示调试信息模态框
                    }}
                    startContent={<FontAwesomeIcon icon={faTerminal} />}
                  >
                    查看调试信息
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 更新内容模态框 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faDownload} />
              更新内容 - {updateInfo?.latest?.tag_name}
            </div>
          </ModalHeader>
          <ModalBody>
            {updateInfo?.latest && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-default-600">
                    发布时间: {format(new Date(updateInfo.latest.published_at), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                  </span>
                  <Button
                    as="a"
                    href={updateInfo.latest.html_url}
                    target="_blank"
                    variant="light"
                    size="sm"
                    endContent={<FontAwesomeIcon icon={faExternalLinkAlt} />}
                  >
                    在 GitHub 上查看
                  </Button>
                </div>
                <Divider />
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm">
                    {updateInfo.latest.body || '暂无更新说明'}
                  </pre>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 更新进度模态框 */}
      <Modal 
        isOpen={isUpdateModalOpen} 
        onClose={handleUpdateModalClose}
        isDismissable={false}
        hideCloseButton={!updateComplete}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <FontAwesomeIcon icon={faRocket} className="text-primary" />
            系统更新进度
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Progress 
                value={updateProgress} 
                className="w-full"
                color={updateComplete ? "success" : "primary"}
                label={updateComplete ? "更新完成" : "更新中..."}
                showValueLabel
              />
              
              <div className="border rounded-lg bg-default-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FontAwesomeIcon icon={faTerminal} className="text-default-600" />
                  <span className="text-sm font-medium">更新日志</span>
                </div>
                
                <ScrollShadow className="h-64">
                  <div className="space-y-2">
                    {updateLogs.map((log, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm">
                        <FontAwesomeIcon 
                          icon={getLogIcon(log.level)} 
                          className={`mt-0.5 ${getLogColor(log.level)}`}
                          size="sm"
                        />
                        <div className="flex-1">
                          <span className="text-default-500 text-xs mr-2">
                            {log.timestamp}
                          </span>
                          <span className={getLogColor(log.level)}>
                            {log.message}
                          </span>
                        </div>
                      </div>
                    ))}
                    {updateLogs.length === 0 && (
                      <div className="text-center text-default-500 py-8">
                        等待更新日志...
                      </div>
                    )}
                  </div>
                </ScrollShadow>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            {updateComplete ? (
              <Button color="primary" onPress={handleUpdateModalClose}>
                完成
              </Button>
            ) : (
              <Button 
                variant="light" 
                onPress={handleUpdateModalClose}
                startContent={<FontAwesomeIcon icon={faTimes} />}
              >
                取消监听
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
} 