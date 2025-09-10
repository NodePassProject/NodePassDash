"use client";

import {
  Card,
  CardBody,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch
} from "@heroui/react";
import React, { forwardRef, useImperativeHandle } from "react";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// 定义表单验证 schema
const systemSettingsSchema = z.object({
  systemName: z.string().min(1, "系统名称不能为空"),
  language: z.enum(["zh", "en"]),
  maxConnections: z.number().int().min(1).max(1000),
  connectionTimeout: z.number().int().min(1).max(3600),
  logLevel: z.enum(["debug", "info", "warn", "error", "event"]),
  logRetentionDays: z.number().int().min(1).max(365),
  autoBackup: z.boolean(),
  backupInterval: z.enum(["daily", "weekly", "monthly"]),
  backupRetention: z.number().int().min(1).max(100),
});

type SystemSettingsForm = z.infer<typeof systemSettingsSchema>;

// 定义组件 ref 类型
export type SystemSettingsRef = {
  submitForm: () => Promise<void>;
  resetForm: () => void;
};

const SystemSettings = forwardRef<SystemSettingsRef>((props, ref) => {
  // 初始化表单
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SystemSettingsForm>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      systemName: "NodePass",
      language: "zh",
      maxConnections: 100,
      connectionTimeout: 60,
      logLevel: "info",
      logRetentionDays: 30,
      autoBackup: true,
      backupInterval: "daily",
      backupRetention: 5,
    },
  });

  // 监听自动备份开关状态
  const autoBackup = watch("autoBackup");

  // 处理表单提交
  const onSubmit = async (data: SystemSettingsForm) => {
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
        <CardBody className="gap-6">
          {/* 基础设置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">基础设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">系统名称</label>
                <Input
                  {...register("systemName")}
                  placeholder="输入系统名称"
                  variant="bordered"
                  isInvalid={!!errors.systemName}
                  errorMessage={errors.systemName?.message}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">系统语言</label>
                <Select
                  selectedKeys={[watch("language")]}
                  onChange={(e) => setValue("language", e.target.value as "zh" | "en")}
                  variant="bordered"
                >
                  <SelectItem key="zh">简体中文</SelectItem>
                  <SelectItem key="en">English</SelectItem>
                </Select>
              </div>
            </div>
          </div>

          <Divider />

          {/* 性能设置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">性能设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">最大连接数</p>
                  <p className="text-sm text-default-500">单个隧道允许的最大并发连接数</p>
                </div>
                <Input
                  {...register("maxConnections", { valueAsNumber: true })}
                  type="number"
                  className="w-32"
                  variant="bordered"
                  isInvalid={!!errors.maxConnections}
                  errorMessage={errors.maxConnections?.message}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">连接超时时间</p>
                  <p className="text-sm text-default-500">空闲连接的超时时间（秒）</p>
                </div>
                <Input
                  {...register("connectionTimeout", { valueAsNumber: true })}
                  type="number"
                  className="w-32"
                  variant="bordered"
                  isInvalid={!!errors.connectionTimeout}
                  errorMessage={errors.connectionTimeout?.message}
                />
              </div>
            </div>
          </div>

          <Divider />

          {/* 日志设置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">日志设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">日志级别</p>
                  <p className="text-sm text-default-500">设置系统日志记录的详细程度</p>
                </div>
                <Select
                  selectedKeys={[watch("logLevel")]}
                  onChange={(e) => setValue("logLevel", e.target.value as "debug" | "info" | "warn" | "error" | "event")}
                  variant="bordered"
                  className="w-32"
                >
                  <SelectItem key="debug">Debug</SelectItem>
                  <SelectItem key="info">Info</SelectItem>
                  <SelectItem key="warn">Warn</SelectItem>
                  <SelectItem key="error">Error</SelectItem>
                  <SelectItem key="event">Event</SelectItem>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">日志保留天数</p>
                  <p className="text-sm text-default-500">系统日志的保留时间</p>
                </div>
                <Input
                  {...register("logRetentionDays", { valueAsNumber: true })}
                  type="number"
                  className="w-32"
                  variant="bordered"
                  isInvalid={!!errors.logRetentionDays}
                  errorMessage={errors.logRetentionDays?.message}
                />
              </div>
            </div>
          </div>

          <Divider />

          {/* 备份设置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">备份设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">自动备份</p>
                  <p className="text-sm text-default-500">定期备份系统配置和数据</p>
                </div>
                <Switch
                  isSelected={autoBackup}
                  onValueChange={(checked) => setValue("autoBackup", checked)}
                />
              </div>
              {autoBackup && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">备份周期</p>
                      <p className="text-sm text-default-500">自动备份的时间间隔</p>
                    </div>
                    <Select
                      selectedKeys={[watch("backupInterval")]}
                      onChange={(e) => setValue("backupInterval", e.target.value as "daily" | "weekly" | "monthly")}
                      variant="bordered"
                      className="w-32"
                    >
                      <SelectItem key="daily">每天</SelectItem>
                      <SelectItem key="weekly">每周</SelectItem>
                      <SelectItem key="monthly">每月</SelectItem>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">保留备份数</p>
                      <p className="text-sm text-default-500">最多保留的备份文件数量</p>
                    </div>
                    <Input
                      {...register("backupRetention", { valueAsNumber: true })}
                      type="number"
                      className="w-32"
                      variant="bordered"
                      isInvalid={!!errors.backupRetention}
                      errorMessage={errors.backupRetention?.message}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </form>
  );
});

SystemSettings.displayName = "SystemSettings";

export default SystemSettings;