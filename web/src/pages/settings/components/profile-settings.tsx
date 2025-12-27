import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Avatar,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faEnvelope,
  faKey,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";

export function ProfileSettings() {
  const { t } = useTranslation("settings");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">{t("profile.title")}</h3>
          <p className="text-small text-default-500">
            {t("profile.description")}
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
            <h4 className="text-lg font-medium text-foreground">{t("profile.avatar.title")}</h4>
            <p className="text-small text-default-500">
              {t("profile.avatar.description")}
            </p>
            <Button className="mt-2" color="primary" size="sm" variant="light">
              {t("profile.avatar.uploadButton")}
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
              label={t("profile.fields.username")}
              placeholder={t("profile.fields.usernamePlaceholder")}
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
              label={t("profile.fields.email")}
              placeholder={t("profile.fields.emailPlaceholder")}
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
              label={t("profile.fields.password")}
              placeholder={t("profile.fields.passwordPlaceholder")}
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
            {t("profile.actions.reset")}
          </Button>
          <Button color="primary">{t("profile.actions.save")}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
