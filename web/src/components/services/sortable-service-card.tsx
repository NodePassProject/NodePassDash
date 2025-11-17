import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { GlassmorphismCard } from "./service-card-variants";
import type { Service } from "@/pages/services";

interface SortableServiceCardProps {
  service: Service;
  formatHost: (host: string | undefined) => string;
  getTypeLabel: (type: string) => string;
  getTypeIcon: (type: string) => any;
  onNavigate: () => void;
  onAction: (action: string) => void;
  isDragging?: boolean;
}

export function SortableServiceCard(props: SortableServiceCardProps) {
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
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      {/* 拖拽手柄 - 左侧 */}
      <div
        className={`
          absolute left-0 top-1/2 -translate-y-1/2 z-20
          w-6 h-12
          flex items-center justify-center
          bg-white/80 dark:bg-gray-800/80 backdrop-blur-md
          border border-white/20 dark:border-gray-700/30
          rounded-r-lg
          shadow-lg
          opacity-0 group-hover/sortable:opacity-100
          transition-all duration-300
          -translate-x-6 group-hover/sortable:translate-x-0
          cursor-grab active:cursor-grabbing
        `}
        {...attributes}
        {...listeners}
      >
        <FontAwesomeIcon
          icon={faGripVertical}
          className="text-gray-400 dark:text-gray-500 text-sm"
        />
      </div>

      {/* 拖拽状态指示器 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-primary border-dashed rounded-xl backdrop-blur-sm" />
      )}

      {/* 原始卡片 */}
      <GlassmorphismCard {...props} />
    </div>
  );
}
