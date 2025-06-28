"use client";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch
} from "@heroui/react";
import React from "react";

import { Icon } from "@iconify/react";

export default function NotificationSettings() {
  return (
    <div className="space-y-6">
      {/* 告警设置 */}
      <Card className="p-2">
        <CardBody className="gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">告警设置</h3>
              <p className="text-sm text-default-500">配置系统告警阈值和触发条件</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-base font-medium">系统资源告警</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">CPU 使用率告警</p>
                    <p className="text-sm text-default-500">CPU 使用率超过阈值时告警</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="80"
                      variant="bordered"
                      endContent="%"
                    />
                    <Switch defaultSelected />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">内存使用率告警</p>
                    <p className="text-sm text-default-500">内存使用率超过阈值时告警</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="90"
                      variant="bordered"
                      endContent="%"
                    />
                    <Switch defaultSelected />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">磁盘使用率告警</p>
                    <p className="text-sm text-default-500">磁盘使用率超过阈值时告警</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="85"
                      variant="bordered"
                      endContent="%"
                    />
                    <Switch defaultSelected />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-base font-medium">安全告警</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">登录失败告警</p>
                    <p className="text-sm text-default-500">连续登录失败超过次数时告警</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="5"
                      variant="bordered"
                      endContent="次"
                    />
                    <Switch defaultSelected />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">异地登录告警</p>
                    <p className="text-sm text-default-500">检测到异地登录时告警</p>
                  </div>
                  <Switch defaultSelected />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">敏感操作告警</p>
                    <p className="text-sm text-default-500">执行敏感操作时告警</p>
                  </div>
                  <Switch defaultSelected />
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 通知渠道 */}
      <Card className="p-2">
        <CardBody className="gap-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">通知渠道</h3>
              <p className="text-sm text-default-500">管理系统通知的发送渠道</p>
            </div>
            <Button color="primary" variant="flat">
              添加通知渠道
            </Button>
          </div>
          
          {/* Telegram 通知 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Icon icon="logos:telegram" width={24} />
                <div>
                  <h4 className="text-base font-medium">Telegram 通知</h4>
                  <p className="text-sm text-default-500">通过 Telegram Bot 发送通知</p>
                </div>
              </div>
              <Switch defaultSelected />
            </div>
            <Divider />
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">Bot Token</label>
                <Input
                  placeholder="输入 Telegram Bot Token"
                  variant="bordered"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">Chat ID</label>
                <Input
                  placeholder="输入 Chat ID"
                  variant="bordered"
                />
              </div>
              <Button size="sm" color="primary">
                测试通知
              </Button>
            </div>
          </div>

          {/* 企业微信通知 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Icon icon="simple-icons:wechat" width={24} />
                <div>
                  <h4 className="text-base font-medium">企业微信通知</h4>
                  <p className="text-sm text-default-500">通过企业微信机器人发送通知</p>
                </div>
              </div>
              <Switch />
            </div>
            <Divider />
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">Webhook URL</label>
                <Input
                  placeholder="输入企业微信 Webhook URL"
                  variant="bordered"
                  type="password"
                />
              </div>
              <Button size="sm" color="primary">
                测试通知
              </Button>
            </div>
          </div>

          {/* 钉钉通知 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Icon icon="simple-icons:dingtalk" width={24} />
                <div>
                  <h4 className="text-base font-medium">钉钉通知</h4>
                  <p className="text-sm text-default-500">通过钉钉机器人发送通知</p>
                </div>
              </div>
              <Switch />
            </div>
            <Divider />
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">Webhook URL</label>
                <Input
                  placeholder="输入钉钉 Webhook URL"
                  variant="bordered"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">安全密钥</label>
                <Input
                  placeholder="输入安全密钥（可选）"
                  variant="bordered"
                  type="password"
                />
              </div>
              <Button size="sm" color="primary">
                测试通知
              </Button>
            </div>
          </div>

          {/* Webhook 通知 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Icon icon="solar:webhook-bold" width={24} />
                <div>
                  <h4 className="text-base font-medium">Webhook 通知</h4>
                  <p className="text-sm text-default-500">通过自定义 Webhook 发送通知</p>
                </div>
              </div>
              <Switch />
            </div>
            <Divider />
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">Webhook URL</label>
                <Input
                  placeholder="输入 Webhook URL"
                  variant="bordered"
                  type="url"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">请求方法</label>
                <Select defaultSelectedKeys={["post"]} variant="bordered">
                  <SelectItem key="post">POST</SelectItem>
                  <SelectItem key="get">GET</SelectItem>
                  <SelectItem key="put">PUT</SelectItem>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">请求头</label>
                <Input
                  placeholder="输入 JSON 格式的请求头"
                  variant="bordered"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">消息模板</label>
                <Input
                  placeholder="输入 JSON 格式的消息模板"
                  variant="bordered"
                />
              </div>
              <Button size="sm" color="primary">
                测试通知
              </Button>
            </div>
          </div>

          {/* Gotify 通知 */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Icon icon="simple-icons:gotify" width={24} />
                <div>
                  <h4 className="text-base font-medium">Gotify 通知</h4>
                  <p className="text-sm text-default-500">通过 Gotify 服务发送通知</p>
                </div>
              </div>
              <Switch />
            </div>
            <Divider />
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-default-700">服务器地址</label>
                <Input
                  placeholder="输入 Gotify 服务器地址"
                  variant="bordered"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-default-700">应用令牌</label>
                <Input
                  placeholder="输入应用令牌"
                  variant="bordered"
                  type="password"
                />
              </div>
              <Button size="sm" color="primary">
                测试通知
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 通知组 */}
      <Card className="p-2">
        <CardBody className="gap-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">通知组</h3>
              <p className="text-sm text-default-500">管理通知接收组和接收人</p>
            </div>
            <Button color="primary" variant="flat">
              添加通知组
            </Button>
          </div>

          <div className="space-y-4">
            {/* 示例通知组 */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-base font-medium">运维团队</h4>
                  <p className="text-sm text-default-500">接收系统运维相关的通知</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="bordered">编辑</Button>
                  <Button size="sm" color="danger" variant="flat">删除</Button>
                </div>
              </div>
              <Divider />
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-default-100 rounded-full px-3 py-1">
                  <Avatar size="sm" src="https://i.pravatar.cc/150?img=1" />
                  <span className="text-sm">张三</span>
                </div>
                <div className="flex items-center gap-2 bg-default-100 rounded-full px-3 py-1">
                  <Avatar size="sm" src="https://i.pravatar.cc/150?img=2" />
                  <span className="text-sm">李四</span>
                </div>
                <Button size="sm" variant="flat" className="rounded-full">
                  <Icon icon="solar:add-circle-bold" className="text-lg" />
                  添加成员
                </Button>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-base font-medium">安全团队</h4>
                  <p className="text-sm text-default-500">接收安全相关的告警通知</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="bordered">编辑</Button>
                  <Button size="sm" color="danger" variant="flat">删除</Button>
                </div>
              </div>
              <Divider />
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-default-100 rounded-full px-3 py-1">
                  <Avatar size="sm" src="https://i.pravatar.cc/150?img=3" />
                  <span className="text-sm">王五</span>
                </div>
                <Button size="sm" variant="flat" className="rounded-full">
                  <Icon icon="solar:add-circle-bold" className="text-lg" />
                  添加成员
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 通知规则 */}
      <Card className="p-2">
        <CardBody className="gap-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">通知规则</h3>
              <p className="text-sm text-default-500">配置通知的触发规则和发送策略</p>
            </div>
            <Button color="primary" variant="flat">
              添加规则
            </Button>
          </div>

          <div className="space-y-4">
            {/* 示例规则 */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-base font-medium">系统资源告警规则</h4>
                  <p className="text-sm text-default-500">当系统资源超过阈值时通知运维团队</p>
                </div>
                <div className="flex gap-2">
                  <Switch defaultSelected />
                  <Button size="sm" variant="bordered">编辑</Button>
                  <Button size="sm" color="danger" variant="flat">删除</Button>
                </div>
              </div>
              <Divider />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-medium">触发条件</p>
                  <p className="text-default-500">CPU &gt; 80% 或 内存 &gt; 90%</p>
                </div>
                <div>
                  <p className="font-medium">通知组</p>
                  <p className="text-default-500">运维团队</p>
                </div>
                <div>
                  <p className="font-medium">通知渠道</p>
                  <p className="text-default-500">Telegram, 企业微信</p>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-base font-medium">安全事件告警规则</h4>
                  <p className="text-sm text-default-500">发现安全事件时立即通知安全团队</p>
                </div>
                <div className="flex gap-2">
                  <Switch defaultSelected />
                  <Button size="sm" variant="bordered">编辑</Button>
                  <Button size="sm" color="danger" variant="flat">删除</Button>
                </div>
              </div>
              <Divider />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-medium">触发条件</p>
                  <p className="text-default-500">检测到异常登录或敏感操作</p>
                </div>
                <div>
                  <p className="font-medium">通知组</p>
                  <p className="text-default-500">安全团队</p>
                </div>
                <div>
                  <p className="font-medium">通知渠道</p>
                  <p className="text-default-500">Telegram, 钉钉</p>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 