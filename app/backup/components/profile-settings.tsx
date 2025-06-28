"use client";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  Input
} from "@heroui/react";
import React from "react";

export default function ProfileSettings() {
  return (
    <div className="space-y-4">
      <Card className="p-2">
        <CardBody>
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex flex-col items-center justify-center md:w-1/3 md:border-r md:pr-8">
              <div className="flex flex-col items-center gap-4">
                <Avatar
                  isBordered
                  className="w-32 h-32"
                  src="https://i.pravatar.cc/150?img=3"
                />
                <Button color="primary" variant="flat" className="w-full">
                  更换头像
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-default-700">用户名</label>
                  <Input
                    placeholder="输入用户名"
                    defaultValue="Admin"
                    variant="bordered"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-default-700">显示名称</label>
                  <Input
                    placeholder="输入显示名称"
                    defaultValue="系统管理员"
                    variant="bordered"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">职位</label>
                <Input
                  placeholder="输入您的职位"
                  defaultValue="系统管理员"
                  variant="bordered"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">电子邮箱</label>
                <Input
                  placeholder="输入电子邮箱"
                  type="email"
                  defaultValue="admin@example.com"
                  variant="bordered"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">所在地</label>
                <Input
                  placeholder="输入您的所在地"
                  variant="bordered"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">个人简介</label>
                <Input
                  placeholder="简单介绍一下自己"
                  variant="bordered"
                />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 