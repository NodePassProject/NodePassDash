"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface EndpointCarouselProps {
  children: React.ReactNode[];
  itemsPerPage?: number;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showIndicators?: boolean;
}

export function EndpointCarousel({ 
  children, 
  itemsPerPage = 4, 
  autoPlay = false, 
  autoPlayInterval = 3000,
  showIndicators = true 
}: EndpointCarouselProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<NodeJS.Timeout>();

  // 计算总页数
  const totalPages = Math.ceil(children.length / itemsPerPage);
  const hasMultiplePages = totalPages > 1;

  // 清除自动播放定时器
  const clearAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = undefined;
    }
  }, []);

  // 设置自动播放定时器
  const setAutoPlay = useCallback(() => {
    if (autoPlay && hasMultiplePages) {
      autoPlayRef.current = setInterval(() => {
        setCurrentPage(prev => (prev + 1) % totalPages);
      }, autoPlayInterval);
    }
  }, [autoPlay, hasMultiplePages, totalPages, autoPlayInterval]);

  // 跳转到指定页面
  const goToPage = useCallback((pageIndex: number) => {
    if (pageIndex === currentPage || isTransitioning) return;
    
    setIsTransitioning(true);
    setCurrentPage(pageIndex);
    
    // 动画完成后重置状态
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, [currentPage, isTransitioning]);

  // 初始化和清理自动播放
  useEffect(() => {
    setAutoPlay();
    return clearAutoPlay;
  }, [setAutoPlay, clearAutoPlay]);

  // 当鼠标悬停时停止自动播放
  const handleMouseEnter = useCallback(() => {
    clearAutoPlay();
  }, [clearAutoPlay]);

  const handleMouseLeave = useCallback(() => {
    setAutoPlay();
  }, [setAutoPlay]);

  // 当前页面要显示的子元素
  const currentItems = children.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  return (
    <div 
      className="w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 轮播容器 - 边距为0 */}
      <div 
        ref={containerRef}
        className="overflow-hidden w-full"
        style={{ margin: 0 }}
      >
        <div 
          className={`flex gap-4 transition-transform duration-300 ease-in-out ${
            isTransitioning ? 'pointer-events-none' : ''
          }`}
          style={{
            transform: `translateX(-${currentPage * 100}%)`,
            width: `${totalPages * 100}%`
          }}
        >
          {/* 将所有页面的内容渲染出来 */}
          {Array.from({ length: totalPages }, (_, pageIndex) => (
            <div 
              key={pageIndex}
              className="flex gap-4 flex-shrink-0"
              style={{ width: `${100 / totalPages}%` }}
            >
              {children.slice(
                pageIndex * itemsPerPage,
                (pageIndex + 1) * itemsPerPage
              ).map((child, index) => (
                <div 
                  key={`${pageIndex}-${index}`}
                  className="flex-1 min-w-0"
                >
                  {child}
                </div>
              ))}
              {/* 如果最后一页项目不够，用空div填充 */}
              {Array.from({ 
                length: itemsPerPage - children.slice(
                  pageIndex * itemsPerPage,
                  (pageIndex + 1) * itemsPerPage
                ).length 
              }, (_, index) => (
                <div key={`empty-${pageIndex}-${index}`} className="flex-1 min-w-0" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 指示器 */}
      {showIndicators && hasMultiplePages && (
        <div className="flex justify-center mt-4 gap-2">
          {Array.from({ length: totalPages }, (_, index) => (
            <button
              key={index}
              onClick={() => goToPage(index)}
              disabled={isTransitioning}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                currentPage === index
                  ? 'bg-primary-500 w-6'
                  : 'bg-default-300 hover:bg-default-400'
              } ${isTransitioning ? 'pointer-events-none' : ''}`}
              aria-label={`跳转到第 ${index + 1} 页`}
            />
          ))}
        </div>
      )}
    </div>
  );
}