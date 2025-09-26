import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Switch,
  Button,
  Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faKey } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";

export function AuthSettings() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">身份验证</h3>
          <p className="text-small text-default-500">
            管理身份验证和 OAuth2 授权配置
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Authentication Method */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">登录方式</h4>

          {/* Local Authentication */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-medium bg-default-100">
                <FontAwesomeIcon
                  className="w-5 h-5 text-default-500"
                  icon={faIdCard}
                />
              </span>
              <div>
                <p className="text-foreground">本地账号密码</p>
                <p className="text-small text-default-500">
                  使用用户名和密码登录
                </p>
              </div>
            </div>
            <Switch defaultSelected isDisabled />
          </div>

          {/* GitHub OAuth */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-medium bg-default-100">
                <Icon className="w-5 h-5 text-default-500" icon="mdi:github" />
              </span>
              <div>
                <p className="text-foreground">GitHub OAuth</p>
                <p className="text-small text-default-500">
                  使用 GitHub 账号登录
                </p>
              </div>
            </div>
            <Switch defaultSelected />
          </div>

          {/* Cloudflare OAuth */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-medium bg-default-100">
                <Icon
                  className="w-5 h-5 text-default-500"
                  icon="simple-icons:cloudflare"
                />
              </span>
              <div>
                <p className="text-foreground">Cloudflare OAuth</p>
                <p className="text-small text-default-500">
                  使用 Cloudflare 账号登录
                </p>
              </div>
            </div>
            <Switch />
          </div>
        </div>

        {/* OAuth2 Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">
            OAuth2 配置
          </h4>

          {/* Client ID */}
          <Input
            label="Client ID"
            placeholder="请输入 OAuth2 Client ID"
            startContent={
              <FontAwesomeIcon
                className="text-default-400 pointer-events-none flex-shrink-0"
                icon={faKey}
              />
            }
            type="text"
          />

          {/* Client Secret */}
          <Input
            label="Client Secret"
            placeholder="请输入 OAuth2 Client Secret"
            startContent={
              <FontAwesomeIcon
                className="text-default-400 pointer-events-none flex-shrink-0"
                icon={faKey}
              />
            }
            type="password"
          />
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
