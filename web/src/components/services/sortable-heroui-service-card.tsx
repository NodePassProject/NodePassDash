import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { HeroUIServiceCard } from "./heroui-service-card";
import type { Service } from "@/pages/services";

interface SortableServiceCardProps {
  service: Service;
  formatHost: (host: string | undefined) => string;
  getTypeLabel: (type: string) => string;
  getTypeIcon: (type: string) => any;
  getTypeColor: (type: string) => "primary" | "success" | "secondary" | "default";
  onNavigate: () => void;
  onAction: (action: string) => void;
}

export function SortableHeroUIServiceCard(props: SortableServiceCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.service.sid });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "default",
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      {/* 拖拽手柄 - 左侧 */}
      <div
        className={`
          absolute left-0 top-1/2 -translate-y-1/2 z-20
          w-7 h-14
          flex items-center justify-center
          bg-background/95 backdrop-blur-md
          border border-divider
          rounded-r-xl
          shadow-lg
          opacity-0 group-hover/sortable:opacity-100
          transition-all duration-300
          -translate-x-7 group-hover/sortable:translate-x-0
          cursor-grab active:cursor-grabbing
          hover:bg-default-100
        `}
        {...attributes}
        {...listeners}
      >
        <FontAwesomeIcon
          icon={faGripVertical}
          className="text-default-400 text-sm"
        />
      </div>

      {/* 拖拽状态指示器 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-primary/5 border-2 border-primary border-dashed rounded-xl backdrop-blur-sm" />
      )}

      {/* 原始卡片 */}
      <HeroUIServiceCard {...props} />
    </div>
  );
}
