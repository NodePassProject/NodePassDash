"use client";

import React, { useState } from 'react';
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { SettingsDrawer } from './settings-drawer';

export const SettingsButton: React.FC = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  return (
    <>
      <Button
        isIconOnly
        variant="light"
        size="md"
        onClick={openDrawer}
        aria-label="个性化设置"
        className="text-default-600 hover:text-primary"
      >
        <Icon icon="solar:pallete-2-bold" width={20} />
      </Button>

      <SettingsDrawer 
        isOpen={isDrawerOpen} 
        onClose={closeDrawer} 
      />
    </>
  );
};