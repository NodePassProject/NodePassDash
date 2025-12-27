"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faTimes } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

// 标签类型
interface Tag {
  id: number;
  name: string;
}

interface SimpleTagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTag?: Tag | null;
  onSaved: () => void;
}

export default function SimpleTagModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentTag,
  onSaved,
}: SimpleTagModalProps) {
  const { t } = useTranslation("tunnels");
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(
    currentTag?.id || null,
  );

  // 获取标签列表
  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl("/api/tags"));

      if (!response.ok) throw new Error(t("simpleTagModal.toast.fetchFailedMessage"));
      const data = await response.json();

      setTags(data.tags || []);
    } catch (error) {
      console.error("获取标签列表失败:", error);
      addToast({
        title: t("simpleTagModal.toast.fetchFailed"),
        description: t("simpleTagModal.toast.fetchFailedDesc"),
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // 保存标签设置
  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/tag`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnelId: parseInt(tunnelId),
            tagId: selectedTagId || 0,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || t("simpleTagModal.toast.setFailedMessage"));
      }

      addToast({
        title: t("simpleTagModal.toast.setSuccess"),
        description: t("simpleTagModal.toast.setSuccessDesc"),
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置标签失败:", error);
      addToast({
        title: t("simpleTagModal.toast.setFailed"),
        description: error instanceof Error ? error.message : t("simpleTagModal.toast.setFailedMessage"),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 清除标签
  const handleClear = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/tag`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnelId: parseInt(tunnelId),
            tagId: 0,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || t("simpleTagModal.toast.clearFailedMessage"));
      }

      addToast({
        title: t("simpleTagModal.toast.clearSuccess"),
        description: t("simpleTagModal.toast.clearSuccessDesc"),
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("清除标签失败:", error);
      addToast({
        title: t("simpleTagModal.toast.clearFailed"),
        description: error instanceof Error ? error.message : t("simpleTagModal.toast.clearFailedMessage"),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 模态框打开时获取数据并设置当前选中的标签
  useEffect(() => {
    if (isOpen) {
      fetchTags();
      setSelectedTagId(currentTag?.id || null);
    }
  }, [isOpen, currentTag]);

  return (
    <Modal isOpen={isOpen} size="md" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faTag} />
                {t("simpleTagModal.title")}
              </div>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-default-600">
                    {t("simpleTagModal.description")}
                  </p>

                  {/* 无标签选项 */}
                  <div
                    className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedTagId(null)}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 ${selectedTagId === null ? "border-primary bg-primary" : "border-default-300"}`}
                    />
                    <span className="text-sm">{t("simpleTagModal.noTag")}</span>
                  </div>

                  {/* 标签列表 */}
                  <div className="space-y-2">
                    {tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedTagId(tag.id)}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 ${selectedTagId === tag.id ? "border-primary bg-primary" : "border-default-300"}`}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </div>
                    ))}
                  </div>

                  {tags.length === 0 && (
                    <div className="text-center py-4">
                      <div className="flex flex-col items-center gap-2">
                        <FontAwesomeIcon
                          className="text-xl text-default-400"
                          icon={faTag}
                        />
                        <p className="text-sm text-default-500">{t("simpleTagModal.empty.title")}</p>
                        <p className="text-xs text-default-400">
                          {t("simpleTagModal.empty.description")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                isDisabled={saving}
                variant="light"
                onPress={onClose}
              >
                {t("simpleTagModal.buttons.cancel")}
              </Button>
              {currentTag && (
                <Button
                  color="danger"
                  isLoading={saving}
                  startContent={<FontAwesomeIcon icon={faTimes} />}
                  variant="light"
                  onPress={handleClear}
                >
                  {t("simpleTagModal.buttons.clear")}
                </Button>
              )}
              <Button
                color="primary"
                isDisabled={selectedTagId === (currentTag?.id || null)}
                isLoading={saving}
                onPress={handleSave}
              >
                {t("simpleTagModal.buttons.save")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
