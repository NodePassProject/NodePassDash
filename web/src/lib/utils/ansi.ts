export function processAnsiColors(text: string): string {
  try {
    // 移除时间戳前缀（如果存在）
    text = text.replace(/\.\d{3}\s/, " ");
    
    // 只移除 \u001B 字符，保留后面的颜色代码
    // text = text.replace(/\u001B/g, ''); // 只移除 ESC 字符，保留 [32m 等
    
    // 将 ANSI 颜色代码转换为 HTML span 标签
    const colorMap = new Map([
      [/\u001B\[32m/g, '<span class="text-green-400">'],   // INFO - 绿色
      [/\u001B\[31m/g, '<span class="text-red-400">'],     // ERROR - 红色
      [/\u001B\[33m/g, '<span class="text-yellow-400">'],  // WARN - 黄色
      [/\u001B\[34m/g, '<span class="text-blue-400">'],    // DEBUG - 蓝色
      [/\u001B\[35m/g, '<span class="text-purple-400">'],  // 紫色
      [/\u001B\[36m/g, '<span class="text-cyan-400">'],    // 青色
      [/\u001B\[37m/g, '<span class="text-gray-400">'],    // 灰色
      [/\u001B\[0m/g, '</span>']                           // 结束标签
    ]);

    // 替换颜色代码
    for (const [pattern, replacement] of colorMap) {
      text = text.replace(pattern, replacement);
    }

    // 确保所有标签都正确闭合
    const openTags = (text.match(/<span/g) || []).length;
    const closeTags = (text.match(/<\/span>/g) || []).length;
    
    // 如果开始标签多于结束标签，添加结束标签
    if (openTags > closeTags) {
      const missingCloseTags = openTags - closeTags;
      text += '</span>'.repeat(missingCloseTags);
    }

    return text;
  } catch (error) {
    console.error('处理ANSI颜色失败:', error);
    return text;
  }
} 