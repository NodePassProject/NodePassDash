import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Avatar,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faEnvelope,
  faKey,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";

export function ProfileSettings() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">个人资料</h3>
          <p className="text-small text-default-500">
            管理您的个人资料信息和账户设置
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar
            className="w-20 h-20"
            size="lg"
            src="https://ui.shadcn.com/avatars/01.png"
          />
          <div>
            <h4 className="text-lg font-medium text-foreground">头像</h4>
            <p className="text-small text-default-500">
              上传您的头像图片，建议使用正方形图片
            </p>
            <Button className="mt-2" color="primary" size="sm" variant="light">
              上传新头像
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Username */}
          <div className="space-y-2">
            <Input
              defaultValue="admin"
              endContent={
                <FontAwesomeIcon
                  className="text-success-500"
                  icon={faCircleCheck}
                />
              }
              label="用户名"
              placeholder="请输入用户名"
              startContent={
                <FontAwesomeIcon
                  className="text-default-400 pointer-events-none flex-shrink-0"
                  icon={faUser}
                />
              }
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Input
              defaultValue="admin@example.com"
              label="邮箱地址"
              placeholder="请输入邮箱地址"
              startContent={
                <FontAwesomeIcon
                  className="text-default-400 pointer-events-none flex-shrink-0"
                  icon={faEnvelope}
                />
              }
              type="email"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Input
              label="修改密码"
              placeholder="输入新密码"
              startContent={
                <FontAwesomeIcon
                  className="text-default-400 pointer-events-none flex-shrink-0"
                  icon={faKey}
                />
              }
              type="password"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button color="danger" variant="light">
            重置
          </Button>
          <Button color="primary">保存更改</Button>
        </div>
      </CardBody>
    </Card>
  );
}
