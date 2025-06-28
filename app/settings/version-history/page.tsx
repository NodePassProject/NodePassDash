"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Divider,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 类型定义
interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

export default function VersionHistoryPage() {
  const [releaseHistory, setReleaseHistory] = useState<GitHubRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // 获取版本历史
  const fetchReleaseHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/version/history');
      const data = await response.json();
      
      if (data.success) {
        setReleaseHistory(data.data);
      } else {
        throw new Error(data.error || '获取版本历史失败');
      }
    } catch (error) {
      console.error('获取版本历史失败:', error);
      addToast({
        title: "获取版本历史失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };
  // 打开 GitHub 发布页面
  const openGitHubRelease = () => {
      window.open("https://github.com/NodePassProject/NodePassDash/releases", '_blank');
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

  // 返回设置页面
  const goBack = () => {
    router.back();
  };

  useEffect(() => {
    fetchReleaseHistory();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Icon icon="lucide:loader-2" className="text-2xl animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          color="default"
          variant="flat"
          startContent={<Icon icon="lucide:arrow-left" />}
          onPress={goBack}
        >
          返回
        </Button>
        <div className="flex items-center gap-2">
          <Icon icon="lucide:history" className="text-2xl text-primary" />
          <h1 className="text-2xl font-bold">版本发布历史</h1>
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

      {/* 版本历史列表 */}
      <div className="space-y-4">
        {releaseHistory.length > 0 ? (
          releaseHistory.map((release, index) => (
            <Card key={release.tag_name} className="border border-default-200">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Chip 
                      color={index === 0 ? 'success' : 'default'} 
                      variant="flat"
                      size="md"
                      startContent={
                        index === 0 ? 
                          <Icon icon="lucide:star" className="text-sm" /> : 
                          <Icon icon="lucide:tag" className="text-sm" />
                      }
                    >
                      {release.tag_name}
                    </Chip>
                    {/* {release.prerelease && (
                      <Chip color="warning" variant="flat" size="sm">
                        预发布
                      </Chip>
                    )}
                    {index === 0 && (
                      <Chip color="success" variant="flat" size="sm">
                        最新版本
                      </Chip>
                    )} */}
                  </div>
                  <div className="text-sm text-default-500">
                    {new Date(release.published_at).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="pt-4">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{release.name}</h3>
                  
                  {release.body && (
                    <div className="text-sm text-default-600">
                      {formatUpdateContent(release.body)}
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      startContent={<Icon icon="lucide:external-link" />}
                      onPress={() => window.open(release.html_url, '_blank')}
                    >
                      在 GitHub 中查看
                    </Button>
                    <Button
                      size="sm"
                      color="default"
                      variant="flat"
                      startContent={<Icon icon="lucide:download" />}
                      onPress={() => window.open(`https://github.com/NodePassProject/NodePassDash/releases/tag/${release.tag_name}`, '_blank')}
                    >
                      下载此版本
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        ) : (
          <Card>
            <CardBody>
              <div className="text-center py-8">
                <Icon icon="lucide:inbox" className="text-4xl text-default-300 mb-4" />
                <div className="text-default-500 text-lg">暂无版本历史</div>
                <div className="text-default-400 text-sm mt-2">
                  请检查网络连接或稍后重试
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex justify-center pt-6">
        <Button 
          color="primary" 
          variant="flat"
          startContent={<Icon icon="lucide:external-link" />}
          onPress={() => window.open('https://github.com/NodePassProject/NodePassDash/releases', '_blank')}
        >
          查看所有版本
        </Button>
      </div>
    </div>
  );
} 