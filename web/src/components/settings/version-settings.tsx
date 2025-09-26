import { useState, useEffect } from "react";
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
  CardHeader,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import { buildApiUrl } from "@/lib/utils";

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
  stable?: GitHubRelease;
  beta?: GitHubRelease;
  hasStableUpdate: boolean;
  hasBetaUpdate: boolean;
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
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<GitHubRelease | null>(
    null,
  );

  const { isOpen, onOpen, onClose } = useDisclosure();

  // 获取当前版本和部署信息
  const fetchVersionData = async () => {
    try {
      setLoading(true);
      const [versionRes, deploymentRes] = await Promise.all([
        fetch(buildApiUrl("/api/version/current")),
        fetch(buildApiUrl("/api/version/deployment-info")),
      ]);

      if (versionRes.ok) {
        const versionData = await versionRes.json();

        setUpdateInfo({
          current: versionData.data,
          hasStableUpdate: false,
          hasBetaUpdate: false,
        });
      }

      if (deploymentRes.ok) {
        const deploymentData = await deploymentRes.json();

        setDeploymentInfo(deploymentData.data);
      }
    } catch (error) {
      console.error("获取版本信息失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 检查更新
  const checkUpdate = async () => {
    try {
      setChecking(true);
      const response = await fetch(buildApiUrl("/api/version/check-update"));

      if (response.ok) {
        const data = await response.json();

        setUpdateInfo(data.data);
      }
    } catch (error) {
      console.error("检查更新失败:", error);
    } finally {
      setChecking(false);
    }
  };

  // 执行自动更新
  const performAutoUpdate = async (type: "stable" | "beta") => {
    try {
      setUpdating(true);

      const response = await fetch(buildApiUrl("/api/version/auto-update"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();

        alert(
          `更新已开始: ${data.message}\n\n程序将在几秒钟后自动重启，请稍等...`,
        );
      } else {
        const errorData = await response.json();

        alert(`更新失败: ${errorData.error}`);
      }
    } catch (error) {
      console.error("执行更新失败:", error);
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
        <CardHeader className="flex gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">版本更新</p>
            <p className="text-sm text-default-500">检查并管理系统版本</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="p-0">
          <div className="divide-y divide-default-200">
            {/* 当前版本行 */}
            <div className="flex items-center justify-between px-4 py-3">
              {/* 左侧：标题 + 版本标签 + 环境信息 */}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-medium whitespace-nowrap">
                    版本信息
                  </h3>
                  <Chip color="primary" size="sm" variant="flat">
                    当前: {updateInfo?.current.current || "unknown"}
                  </Chip>
                  {updateInfo?.hasStableUpdate && updateInfo.stable && (
                    <Chip
                      className="cursor-pointer hover:opacity-80"
                      color="success"
                      size="sm"
                      variant="flat"
                      onClick={() => {
                        setSelectedVersion(updateInfo.stable!);
                        onOpen();
                      }}
                    >
                      稳定版: {updateInfo.stable.tag_name}
                    </Chip>
                  )}
                  {updateInfo?.hasBetaUpdate && updateInfo.beta && (
                    <Chip
                      className="cursor-pointer hover:opacity-80"
                      color="warning"
                      size="sm"
                      variant="flat"
                      onClick={() => {
                        setSelectedVersion(updateInfo.beta!);
                        onOpen();
                      }}
                    >
                      测试版: {updateInfo.beta.tag_name}
                    </Chip>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-default-500">
                  <span>
                    系统: {updateInfo?.current.os}/{updateInfo?.current.arch}
                  </span>
                </div>
              </div>

              {/* 右侧按钮 */}
              <Button
                isLoading={checking}
                size="sm"
                startContent={<Icon icon="solar:refresh-bold" width={18} />}
                variant="bordered"
                onPress={checkUpdate}
              >
                检查更新
              </Button>
            </div>

            {/* 部署环境行 */}
            {deploymentInfo && (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium whitespace-nowrap">
                      部署环境
                    </h3>
                    <Chip color="default" size="sm" variant="flat">
                      <Icon
                        className="text-default-600"
                        icon={
                          deploymentInfo.method === "docker"
                            ? "solar:server-path-bold"
                            : "solar:monitor-bold"
                        }
                        width={14}
                      />
                      &nbsp;
                      <span className="font-medium">
                        {deploymentInfo.method === "docker"
                          ? "Docker 部署"
                          : "二进制部署"}
                      </span>
                    </Chip>
                  </div>
                  <p className="text-sm text-default-500">
                    {deploymentInfo.details}
                  </p>
                </div>

                <div className="flex gap-2">
                  {updateInfo?.hasStableUpdate &&
                    updateInfo.stable &&
                    deploymentInfo.canUpdate && (
                      <Button
                        color="primary"
                        isLoading={updating}
                        size="sm"
                        startContent={
                          <Icon icon="solar:rocket-bold" width={18} />
                        }
                        onPress={() => performAutoUpdate("stable")}
                      >
                        自动更新稳定版
                      </Button>
                    )}
                  {updateInfo?.hasBetaUpdate &&
                    updateInfo.beta &&
                    deploymentInfo.canUpdate && (
                      <Button
                        color="warning"
                        isLoading={updating}
                        size="sm"
                        startContent={
                          <Icon icon="solar:rocket-bold" width={18} />
                        }
                        onPress={() => performAutoUpdate("beta")}
                      >
                        自动更新测试版
                      </Button>
                    )}
                  {!deploymentInfo.canUpdate && (
                    <Button
                      isDisabled
                      size="sm"
                      startContent={
                        <Icon icon="solar:terminal-bold" width={18} />
                      }
                      variant="flat"
                    >
                      手动更新
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 手动更新说明，保持原有块级展示 */}
          {deploymentInfo && !deploymentInfo.canUpdate && (
            <div className="px-4 py-5 bg-default-100 rounded-b-lg">
              <h4 className="text-sm font-medium mb-2">更新说明：</h4>
              <div className="text-sm text-default-600 space-y-1">
                {deploymentInfo.method === "docker" ? (
                  <>
                    <p>在 Docker 宿主机上执行以下命令：</p>
                    <div className="mt-2 p-2 bg-black text-green-400 rounded font-mono text-xs overflow-x-auto">
                      <div># 拉取最新镜像</div>
                      <div>
                        docker pull ghcr.io/nodepassproject/nodepassdash:latest
                      </div>
                      <div className="mt-1"># 重启容器</div>
                      <div>docker-compose down && docker-compose up -d</div>
                    </div>
                  </>
                ) : (
                  <>
                    <p>点击上方按钮即可自动更新</p>
                    <div className="mt-2 space-y-1 text-xs">
                      <p>程序会自动下载、停止、替换和重启</p>
                      <p className="mt-2 text-default-400">
                        或手动更新：从 GitHub 下载→停止程序→替换文件→重启
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 更新详情模态框 */}
      <Modal isOpen={isOpen} size="2xl" onClose={onClose}>
        <ModalContent>
          <ModalHeader>
            <h3>版本更新详情</h3>
          </ModalHeader>
          <ModalBody>
            {selectedVersion && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Chip
                    color={selectedVersion.prerelease ? "warning" : "success"}
                    variant="flat"
                  >
                    {selectedVersion.tag_name}
                    {selectedVersion.prerelease && " (测试版)"}
                  </Chip>
                  <span className="text-sm text-default-500">
                    发布于{" "}
                    {format(
                      new Date(selectedVersion.published_at),
                      "yyyy年MM月dd日",
                      { locale: zhCN },
                    )}
                  </span>
                </div>

                <div className="prose prose-sm max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: selectedVersion.body.replace(/\n/g, "<br/>"),
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
              endContent={<Icon icon="solar:external-link-bold" width={18} />}
              onPress={() => {
                if (selectedVersion?.html_url) {
                  window.open(selectedVersion.html_url, "_blank");
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
