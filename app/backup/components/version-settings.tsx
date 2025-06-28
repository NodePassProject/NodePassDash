"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Divider,
  Snippet,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Spacer,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { useState, useEffect } from "react";

// 类型定义
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

export default function VersionSettings() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 获取当前版本信息
  const fetchCurrentVersion = async () => {
    try {
      const response = await fetch('/api/version/current');
      const data = await response.json();
      
      if (data.success) {
        setVersionInfo(data.data);
      } else {
        throw new Error(data.error || '获取版本信息失败');
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
      addToast({
        title: "获取版本信息失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 检查更新
  const checkForUpdate = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/version/check-update');
      const data = await response.json();
      
      if (data.success) {
        setUpdateInfo(data.data);
        if (data.data.hasUpdate) {
          addToast({
            title: "发现新版本",
            description: `最新版本: ${data.data.latest?.tag_name}`,
            color: "success",
          });
        } else {
          addToast({
            title: "已是最新版本",
            description: "当前版本已是最新版本",
            color: "success",
          });
        }
      } else {
        throw new Error(data.error || '检查更新失败');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      addToast({
        title: "检查更新失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsChecking(false);
    }
  };

  // 格式化更新内容
  const formatUpdateContent = (content: string) => {
    if (!content) return '';
    
    // 简单的 Markdown 格式化
    return content
      .replace(/^### /gm, '**')
      .replace(/^## /gm, '**')
      .replace(/^# /gm, '**')
      .replace(/\*\*/g, '**')
      .split('\n')
      .map((line, index) => (
        <div key={index} className={line.startsWith('**') ? 'font-semibold text-primary' : ''}>
          {line.replace(/\*\*/g, '')}
        </div>
      ));
  };

  // 打开 GitHub 发布页面
  const openGitHubRelease = () => {
    if (updateInfo?.latest?.html_url) {
      window.open(updateInfo.latest.html_url, '_blank');
    }
  };

  // 复制更新命令
  const copyUpdateCommand = () => {
    const command = 'docker pull your-registry/nodepass-webui:latest && docker-compose restart';
    navigator.clipboard.writeText(command);
    addToast({
      title: "已复制",
      description: "更新命令已复制到剪贴板",
      color: "success",
    });
  };

  useEffect(() => {
    fetchCurrentVersion();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Icon icon="lucide:loader-2" className="text-2xl animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 当前版本信息 */}
      <Card>
        <CardHeader className="flex gap-3">
          <Icon icon="lucide:info" className="text-2xl text-primary" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">当前版本信息</p>
            <p className="text-small text-default-500">系统版本和运行环境信息</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-default-600">版本号:</span>
                <Chip 
                  color={versionInfo?.current === 'dev' ? 'warning' : 'primary'} 
                  variant="flat"
                  size="sm"
                >
                  {versionInfo?.current || 'unknown'}
                </Chip>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-default-600">Go 版本:</span>
                <span className="text-sm font-mono">{versionInfo?.goVersion}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-default-600">操作系统:</span>
                <span className="text-sm font-mono">{versionInfo?.os}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-default-600">架构:</span>
                <span className="text-sm font-mono">{versionInfo?.arch}</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 版本检查 */}
      <Card>
        <CardHeader className="flex gap-3">
          <Icon icon="lucide:refresh-cw" className="text-2xl text-secondary" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">版本检查</p>
            <p className="text-small text-default-500">检查 GitHub 最新版本并查看更新内容</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex flex-col gap-4">
            <Button
              color="secondary"
              variant="flat"
              startContent={<Icon icon="lucide:search" />}
              isLoading={isChecking}
              onPress={checkForUpdate}
              className="w-fit"
            >
              检查更新
            </Button>

            {updateInfo && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-default-600">检查结果:</span>
                  <Chip 
                    color={updateInfo.hasUpdate ? 'success' : 'default'} 
                    variant="flat"
                    size="sm"
                    startContent={
                      <Icon 
                        icon={updateInfo.hasUpdate ? 'lucide:arrow-up' : 'lucide:check'} 
                        className="text-sm"
                      />
                    }
                  >
                    {updateInfo.hasUpdate ? '有新版本可用' : '已是最新版本'}
                  </Chip>
                </div>

                {updateInfo.hasUpdate && updateInfo.latest && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-default-600">最新版本:</span>
                      <span className="text-sm font-semibold text-success">
                        {updateInfo.latest.tag_name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-default-600">发布时间:</span>
                      <span className="text-sm">
                        {new Date(updateInfo.latest.published_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        startContent={<Icon icon="lucide:eye" />}
                        onPress={onOpen}
                      >
                        查看更新内容
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        variant="flat"
                        startContent={<Icon icon="lucide:external-link" />}
                        onPress={openGitHubRelease}
                      >
                        GitHub 发布页面
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 手动更新 */}
      <Card>
        <CardHeader className="flex gap-3">
          <Icon icon="lucide:download" className="text-2xl text-warning" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">手动更新</p>
            <p className="text-small text-default-500">通过 Docker 命令手动更新到最新版本</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="space-y-4">
            <div className="text-sm text-default-600">
              复制下面的命令到服务器终端执行以更新到最新版本:
            </div>
            <Snippet 
              hideSymbol
              classNames={{
                pre: "text-xs",
                base: "w-full"
              }}
            >
              docker pull your-registry/nodepass-webui:latest && docker-compose restart
            </Snippet>
            <Button
              size="sm"
              color="warning"
              variant="flat"
              startContent={<Icon icon="lucide:copy" />}
              onPress={copyUpdateCommand}
              className="w-fit"
            >
              复制更新命令
            </Button>
            <div className="text-xs text-default-500">
              注意：执行更新命令前请确保已备份重要数据
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 更新内容模态框 */}
      <Modal 
        isOpen={isOpen} 
        onOpenChange={onOpenChange}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:scroll-text" className="text-xl" />
                  <span>更新日志</span>
                </div>
                {updateInfo?.latest && (
                  <div className="text-sm font-normal text-default-500">
                    版本 {updateInfo.latest.tag_name} • {updateInfo.latest.name}
                  </div>
                )}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3 text-sm">
                  {updateInfo?.updateContent ? (
                    formatUpdateContent(updateInfo.updateContent)
                  ) : (
                    <div className="text-default-500">暂无更新内容</div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="flat" onPress={onClose}>
                  关闭
                </Button>
                <Button 
                  color="primary" 
                  onPress={() => {
                    openGitHubRelease();
                    onClose();
                  }}
                  startContent={<Icon icon="lucide:external-link" />}
                >
                  在 GitHub 中查看
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
} 