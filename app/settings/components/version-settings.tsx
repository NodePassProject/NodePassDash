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
  Divider
} from '@heroui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDownload, 
  faExternalLinkAlt, 
  faRocket, 
  faSync,
  faTerminal,
  faFileCode,
  faBox,
  faDesktop
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
  manualUpdate: string;
  hasDockerPerm: boolean;
  environment: string;
  details: string;
  debugInfo: any;
}

export default function VersionSettings() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

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

  // 执行更新
  const performUpdate = async () => {
    try {
      setUpdating(true);
      
      const response = await fetch('/api/version/auto-update', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        alert(`更新请求已提交: ${data.message}`);
      } else {
        const errorData = await response.json();
        alert(`更新失败: ${errorData.error}`);
      }
    } catch (error) {
      console.error('执行更新失败:', error);
      alert(`更新失败: ${error}`);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchVersionData();
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
      <Card className="mt-5 p-2">
        <CardBody className="gap-6">
          {/* 当前版本信息 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">版本信息</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-default-700">当前版本</span>
                  <Chip variant="flat" color="primary">
                    {updateInfo?.current.current || 'unknown'}
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
                <div className="flex items-center gap-4 text-sm text-default-500">
                  <span>系统: {updateInfo?.current.os}/{updateInfo?.current.arch}</span>
                  <span>Go: {updateInfo?.current.goVersion}</span>
                </div>
              </div>

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

          {/* 部署方式和更新 */}
          {deploymentInfo && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">部署环境</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon 
                      icon={deploymentInfo.method === 'docker' ? faBox : faDesktop} 
                      className="text-default-600"
                    />
                    <span className="font-medium">
                      {deploymentInfo.method === 'docker' ? 'Docker 部署' : '二进制部署'}
                    </span>
                  </div>
                  <p className="text-sm text-default-500">{deploymentInfo.details}</p>
                </div>

                {deploymentInfo.canUpdate ? (
                  <Button
                    color="primary"
                    size="sm"
                    onPress={performUpdate}
                    isLoading={updating}
                    startContent={<FontAwesomeIcon icon={faRocket} />}
                  >
                    立即更新
                  </Button>
                ) : (
                  <Button
                    variant="flat"
                    size="sm"
                    isDisabled
                    startContent={<FontAwesomeIcon icon={faTerminal} />}
                  >
                    手动更新
                  </Button>
                )}
              </div>

              {/* 手动更新说明 */}
              {!deploymentInfo.canUpdate && (
                <div className="mt-4 p-3 bg-default-100 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">手动更新说明：</h4>
                  <div className="text-sm text-default-600 space-y-1">
                    {deploymentInfo.method === 'docker' ? (
                      <>
                        <p>在Docker宿主机上执行以下命令：</p>
                        <div className="mt-2 p-2 bg-black text-green-400 rounded font-mono text-xs overflow-x-auto">
                          <div># 拉取最新镜像</div>
                          <div>docker pull ghcr.io/nodepassproject/nodepassdash:latest</div>
                          <div className="mt-1"># 重启容器</div>
                          <div>docker-compose down && docker-compose up -d</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>手动下载和安装：</p>
                        <div className="mt-2 space-y-1 text-xs">
                          <p>1. 从 GitHub Releases 下载对应平台的二进制文件</p>
                          <p>2. 停止当前程序</p>
                          <p>3. 替换二进制文件</p>
                          <p>4. 重新启动程序</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 更新详情模态框 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>
            <h3>版本更新详情</h3>
          </ModalHeader>
          <ModalBody>
            {updateInfo?.latest && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Chip color="success" variant="flat">
                    {updateInfo.latest.tag_name}
                  </Chip>
                  <span className="text-sm text-default-500">
                    发布于 {format(new Date(updateInfo.latest.published_at), 'yyyy年MM月dd日', { locale: zhCN })}
                  </span>
                </div>
                
                <div className="prose prose-sm max-w-none">
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: updateInfo.latest.body.replace(/\n/g, '<br/>') 
                    }} 
                  />
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              关闭
            </Button>
            <Button 
              color="primary" 
              endContent={<FontAwesomeIcon icon={faExternalLinkAlt} />}
              onPress={() => {
                if (updateInfo?.latest?.html_url) {
                  window.open(updateInfo.latest.html_url, '_blank');
                }
              }}
            >
              查看详情
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
} 