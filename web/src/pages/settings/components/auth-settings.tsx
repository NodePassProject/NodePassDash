import {
  Card,
  CardHeader,
  CardBody,
  Switch,
  Button,
  Input,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faKey } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";

export function AuthSettings() {
  const { t } = useTranslation("settings");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-semibold text-foreground">{t("auth.title")}</h3>
          <p className="text-small text-default-500">
            {t("auth.description")}
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Authentication Method */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">{t("auth.loginMethods.title")}</h4>

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
                <p className="text-foreground">{t("auth.loginMethods.local.title")}</p>
                <p className="text-small text-default-500">
                  {t("auth.loginMethods.local.description")}
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
                <p className="text-foreground">{t("auth.loginMethods.github.title")}</p>
                <p className="text-small text-default-500">
                  {t("auth.loginMethods.github.description")}
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
                <p className="text-foreground">{t("auth.loginMethods.cloudflare.title")}</p>
                <p className="text-small text-default-500">
                  {t("auth.loginMethods.cloudflare.description")}
                </p>
              </div>
            </div>
            <Switch />
          </div>
        </div>

        {/* OAuth2 Settings */}
        <div className="space-y-4">
          <h4 className="text-medium font-medium text-foreground">
            {t("auth.oauth2Config.title")}
          </h4>

          {/* Client ID */}
          <Input
            label={t("auth.oauth2Config.clientId")}
            placeholder={t("auth.oauth2Config.clientIdPlaceholder")}
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
            label={t("auth.oauth2Config.clientSecret")}
            placeholder={t("auth.oauth2Config.clientSecretPlaceholder")}
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
            {t("auth.actions.reset")}
          </Button>
          <Button color="primary">{t("auth.actions.save")}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
