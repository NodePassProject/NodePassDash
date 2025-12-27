"use client";

import { Avatar, Button, Card, CardBody, Input } from "@heroui/react";
import React from "react";
import { useTranslation } from "react-i18next";

export default function ProfileSettings() {
  const { t } = useTranslation("settings");

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
                <Button className="w-full" color="primary" variant="flat">
                  {t("profile.avatar.changeButton")}
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-default-700">{t("profile.fields.username")}</label>
                  <Input
                    defaultValue="Admin"
                    placeholder={t("profile.fields.usernamePlaceholder")}
                    variant="bordered"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-default-700">{t("profile.fields.displayName")}</label>
                  <Input
                    defaultValue="系统管理员"
                    placeholder={t("profile.fields.displayNamePlaceholder")}
                    variant="bordered"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">{t("profile.fields.position")}</label>
                <Input
                  defaultValue="系统管理员"
                  placeholder={t("profile.fields.positionPlaceholder")}
                  variant="bordered"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">{t("profile.fields.email")}</label>
                <Input
                  defaultValue="admin@example.com"
                  placeholder={t("profile.fields.emailPlaceholder")}
                  type="email"
                  variant="bordered"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">{t("profile.fields.location")}</label>
                <Input placeholder={t("profile.fields.locationPlaceholder")} variant="bordered" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-default-700">{t("profile.fields.bio")}</label>
                <Input placeholder={t("profile.fields.bioPlaceholder")} variant="bordered" />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
