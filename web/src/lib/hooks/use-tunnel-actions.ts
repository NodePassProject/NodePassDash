import { addToast } from "@heroui/toast";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

export interface TunnelActionOptions {
  tunnelId: string;
  tunnelName: string;
  instanceId: string;
  onStatusChange?: (tunnelId: string, isRunning: boolean) => void;
  redirectAfterDelete?: boolean;
  onSuccess?: () => void;
  recycle?: boolean;
}

export const useTunnelActions = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("tunnels");

  const toggleStatus = async (
    isRunning: boolean,
    options: TunnelActionOptions,
  ) => {
    const { tunnelId, tunnelName, instanceId, onStatusChange } = options;
    const action = isRunning ? "stop" : "start";

    // 显示进行中toast
    addToast({
      title: isRunning ? t("toast.instanceActions.stopping") : t("toast.instanceActions.starting"),
      description: tunnelName
        ? (isRunning ? t("toast.instanceActions.stopInstance", { name: tunnelName }) : t("toast.instanceActions.startInstance", { name: tunnelName }))
        : t("toast.instanceActions.pleaseWait"),
      color: "primary",
    });

    try {
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/status`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: action,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || t(`toast.instanceActions.failedTo${isRunning ? "Stop" : "Start"}`));
      }

      // 更新状态 (使用tunnelId用于前端状态管理)
      if (tunnelId) {
        onStatusChange?.(tunnelId, !isRunning);
      }

      // 显示成功提示
      addToast({
        title: isRunning ? t("toast.instanceActions.instanceStopped") : t("toast.instanceActions.instanceStarted"),
        description: tunnelName
          ? (isRunning ? t("toast.instanceActions.stoppedSuccessfully", { name: tunnelName }) : t("toast.instanceActions.startedSuccessfully", { name: tunnelName }))
          : (isRunning ? t("toast.instanceActions.instanceStoppedSuccessfully") : t("toast.instanceActions.instanceStartedSuccessfully")),
        color: "success",
      });
    } catch (error) {
      // 显示错误提示
      addToast({
        title: isRunning ? t("toast.instanceActions.failedToStop") : t("toast.instanceActions.failedToStart"),
        description:
          error instanceof Error
            ? error.message
            : tunnelName
              ? (isRunning ? t("toast.instanceActions.failedToStopInstance", { name: tunnelName }) : t("toast.instanceActions.failedToStartInstance", { name: tunnelName }))
              : (isRunning ? t("toast.instanceActions.failedToStop") : t("toast.instanceActions.failedToStart")),
        color: "danger",
      });
    }
  };

  const restart = async (options: TunnelActionOptions) => {
    const { tunnelId, tunnelName, instanceId, onStatusChange } = options;

    // 显示进行中toast
    addToast({
      title: t("toast.instanceActions.restarting"),
      description: tunnelName ? t("toast.instanceActions.restartInstance", { name: tunnelName }) : t("toast.instanceActions.pleaseWait"),
      color: "primary",
    });

    try {
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/status`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "restart",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || t("toast.instanceActions.restartFailed"));
      }

      // 更新状态 (使用tunnelId用于前端状态管理)
      if (tunnelId) {
        onStatusChange?.(tunnelId, true);
      }

      // 显示成功提示
      addToast({
        title: t("toast.instanceActions.instanceRestarted"),
        description: tunnelName
          ? t("toast.instanceActions.restartedSuccessfully", { name: tunnelName })
          : t("toast.instanceActions.instanceRestartedSuccessfully"),
        color: "success",
      });
    } catch (error) {
      // 显示错误提示
      addToast({
        title: t("toast.instanceActions.restartFailed"),
        description:
          error instanceof Error
            ? error.message
            : tunnelName
              ? t("toast.instanceActions.failedToRestartInstance", { name: tunnelName })
              : t("toast.instanceActions.restartFailed"),
        color: "danger",
      });
    }
  };

  const deleteTunnel = async (options: TunnelActionOptions) => {
    const {
      tunnelId,
      tunnelName,
      instanceId,
      redirectAfterDelete = true,
      onSuccess,
      recycle = false,
    } = options;

    // 显示进行中toast
    addToast({
      title: t("toast.instanceActions.deleting"),
      description: tunnelName ? t("toast.instanceActions.deleteInstance", { name: tunnelName }) : t("toast.instanceActions.pleaseWait"),
      color: "primary",
    });

    try {
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}` + (recycle ? "?recycle=1" : "")),
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || t("toast.instanceActions.deleteFailed"));
      }

      // 显示成功提示
      addToast({
        title: t("toast.instanceActions.instanceDeleted"),
        description: tunnelName
          ? t("toast.instanceActions.deletedSuccessfully", { name: tunnelName })
          : t("toast.instanceActions.instanceDeletedSuccessfully"),
        color: "success",
      });

      // 调用成功回调
      onSuccess?.();

      // 成功删除后跳转
      if (redirectAfterDelete) {
        setTimeout(() => {
          navigate("/tunnels");
        }, 500);
      }
    } catch (error) {
      // 显示错误提示
      addToast({
        title: t("toast.instanceActions.deleteFailed"),
        description:
          error instanceof Error
            ? error.message
            : tunnelName
              ? t("toast.instanceActions.failedToDeleteInstance", { name: tunnelName })
              : t("toast.instanceActions.deleteFailed"),
        color: "danger",
      });
    }
  };

  return {
    toggleStatus,
    restart,
    deleteTunnel,
  };
};
