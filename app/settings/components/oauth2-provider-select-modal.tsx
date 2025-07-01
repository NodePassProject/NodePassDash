import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader
  } from "@heroui/react";
  import Image from "next/image";
  import React from "react";
  import { Icon } from "@iconify/react";
  
  interface Props {
    isOpen: boolean;
    onOpenChange: (isOpen?: boolean) => void;
    onSelect: (provider: "github" | "cloudflare") => void;
  }
  
  /**
   * OAuth2 提供者选择模态框
   */
  const OAuth2ProviderSelectModal: React.FC<Props> = ({ isOpen, onOpenChange, onSelect }) => {
    return (
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                选择 OAuth2 认证提供者
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4 pb-4">
                  <Button
                    variant="bordered"
                    startContent={<Image src="/github-icon-svgrepo-com.svg" alt="GitHub" width={24} height={24} className="dark:invert" />}
                    endContent={<Icon icon="solar:arrow-right-linear" width={18} />}
                    onPress={() => onSelect("github")}
                  >
                    GitHub
                  </Button>
                  <Button
                    variant="bordered"
                    startContent={<Image src="/cloudflare-svgrepo-com.svg" alt="Cloudflare" width={24} height={24} />}
                    endContent={<Icon icon="solar:arrow-right-linear" width={18} />}
                    onPress={() => onSelect("cloudflare")}
                  >
                    Cloudflare
                  </Button>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    );
  };
  
  export default OAuth2ProviderSelectModal; 