import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Switch,
  Button,
  RadioGroup,
  Radio,
  Select,
  SelectItem
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faMoon,
  faSun,
  faComputerMouse
} from "@fortawesome/free-solid-svg-icons";

export function SystemSettings() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">系统设置</h3>
          <p className="text-small text-default-500">
            自定义系统外观和行为偏好
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Theme Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">主题设置</h4>
          
          <RadioGroup
            defaultValue="system"
            orientation="horizontal"
          >
            <div className="flex items-center gap-6">
              <Radio value="light">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faSun} className="w-4 h-4" />
                  <span>浅色</span>
                </div>
              </Radio>
              <Radio value="dark">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faMoon} className="w-4 h-4" />
                  <span>深色</span>
                </div>
              </Radio>
              <Radio value="system">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faComputerMouse} className="w-4 h-4" />
                  <span>跟随系统</span>
                </div>
              </Radio>
            </div>
          </RadioGroup>
        </div>

        {/* Language Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">语言设置</h4>
          <Select
            label="界面语言"
            className="max-w-xs"
            defaultSelectedKeys={["zh-CN"]}
          >
            <SelectItem key="zh-CN" value="zh-CN">
              简体中文
            </SelectItem>
            <SelectItem key="en-US" value="en-US">
              English
            </SelectItem>
          </Select>
        </div>

        {/* Behavior Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">行为设置</h4>

          {/* Auto Save */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">自动保存</p>
              <p className="text-small text-default-500">自动保存修改的配置和表单</p>
            </div>
            <Switch defaultSelected />
          </div>

          {/* Auto Update */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">自动更新</p>
              <p className="text-small text-default-500">自动检查并提示更新</p>
            </div>
            <Switch defaultSelected />
          </div>

          {/* Telemetry */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">遥测数据</p>
              <p className="text-small text-default-500">发送使用数据以帮助改进产品</p>
            </div>
            <Switch />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            color="danger"
            variant="light"
          >
            重置
          </Button>
          <Button
            color="primary"
          >
            保存更改
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}