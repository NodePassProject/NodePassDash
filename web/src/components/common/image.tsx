import { useState, useEffect } from "react";

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean; // 模拟Next.js Image的priority属性
}

export default function Image({
  src,
  alt,
  width,
  height,
  priority,
  ...props
}: ImageProps) {
  const [imageSrc, setImageSrc] = useState(src);

  // 当src改变时更新图片源，确保主题切换时能正确更新
  useEffect(() => {
    setImageSrc(src);
  }, [src]);

  return (
    <img
      alt={alt}
      height={height}
      loading={priority ? "eager" : "lazy"} // 模拟priority行为
      src={imageSrc}
      width={width}
      {...props}
    />
  );
}
