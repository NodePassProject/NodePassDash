"use client";

import {
  Button,
  Card,
  CardBody,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch
} from "@heroui/react";
import React, { forwardRef, useImperativeHandle } from "react";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// 定义表单验证 schema
const securitySettingsSchema = z.object({
  twoFactorEnabled: z.boolean(),
});

type SecuritySettingsForm = z.infer<typeof securitySettingsSchema>;

// 定义组件 ref 类型
export type SecuritySettingsRef = {
  submitForm: () => Promise<void>;
  resetForm: () => void;
};

const SecuritySettings = forwardRef<SecuritySettingsRef>((props, ref) => {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  // 初始化表单
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SecuritySettingsForm>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      twoFactorEnabled: true,
    },
  });

  const handleChangePassword = () => {
    // TODO: 实现密码修改逻辑
    console.log("修改密码", { currentPassword, newPassword, confirmPassword });
    setIsChangePasswordOpen(false);
    // 重置表单
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // 处理表单提交
  const onSubmit = async (data: SecuritySettingsForm) => {
    try {
      // TODO: 调用后端 API 保存设置
      console.log("保存设置:", data);
    } catch (error) {
      console.error("保存设置失败:", error);
      throw error;
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    submitForm: () => handleSubmit(onSubmit)(),
    resetForm: () => reset(),
  }));

  return (
    <form>
      <Card className="mt-5 p-2">
        <CardBody className="gap-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-medium">修改密码</h3>
                <p className="text-sm text-default-500">定期更新密码以提高账户安全性</p>
              </div>
              <Button 
                color="primary" 
                variant="flat"
                onPress={() => setIsChangePasswordOpen(true)}
              >
                修改密码
              </Button>
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-medium">双因素认证</h3>
                <p className="text-sm text-default-500">使用验证器应用进行双重身份验证</p>
              </div>
              <Switch {...register("twoFactorEnabled")} />
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-medium">登录设备管理</h3>
                <p className="text-sm text-default-500">查看并管理已登录的设备</p>
              </div>
              <Button color="primary" variant="flat">
                查看设备
              </Button>
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-medium">登录历史记录</h3>
                <p className="text-sm text-default-500">查看近期的登录活动</p>
              </div>
              <Button color="primary" variant="flat">
                查看记录
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Modal 
        isOpen={isChangePasswordOpen} 
        onOpenChange={setIsChangePasswordOpen}
        placement="center"
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-medium">修改密码</h3>
                <p className="text-sm text-default-500">请输入您的当前密码和新密码</p>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-default-700">当前密码</label>
                    <Input
                      type="password"
                      variant="bordered"
                      placeholder="输入当前密码"
                      value={currentPassword}
                      onValueChange={setCurrentPassword}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-default-700">新密码</label>
                    <Input
                      type="password"
                      variant="bordered"
                      placeholder="输入新密码"
                      value={newPassword}
                      onValueChange={setNewPassword}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-default-700">确认新密码</label>
                    <Input
                      type="password"
                      variant="bordered"
                      placeholder="再次输入新密码"
                      value={confirmPassword}
                      onValueChange={setConfirmPassword}
                      isInvalid={confirmPassword !== "" && newPassword !== confirmPassword}
                      errorMessage={
                        confirmPassword !== "" && 
                        newPassword !== confirmPassword && 
                        "两次输入的密码不一致"
                      }
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="danger" 
                  variant="light" 
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button 
                  color="primary"
                  onPress={handleChangePassword}
                  isDisabled={
                    !currentPassword || 
                    !newPassword || 
                    !confirmPassword ||
                    newPassword !== confirmPassword
                  }
                >
                  确认修改
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </form>
  );
});

SecuritySettings.displayName = "SecuritySettings";

export default SecuritySettings; 