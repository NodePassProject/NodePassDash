import { NextRequest, NextResponse } from 'next/server';

// 队列状态监控API
export async function GET(request: NextRequest) {
  try {
    // 这里应该调用Go后端的队列状态API
    // 暂时返回模拟数据，实际实现需要连接到Go后端
    const mockData = {
      timestamp: new Date().toISOString(),
      sse_manager: {
        jobs_queue: {
          current: 0,
          capacity: 30000,
          usage_pct: 0
        },
        workers: 12
      },
      sse_service: {
        store_job_queue: {
          current: 0,
          capacity: 20000,
          usage_pct: 0
        },
        batch_insert_queue: {
          current: 0,
          capacity: 5000,
          usage_pct: 0
        },
        batch_insert_buffer: {
          current: 0,
          capacity: 200,
          usage_pct: 0
        },
        workers: 8
      },
      history_worker: {
        data_input_queue: {
          current: 0,
          capacity: 15000,
          usage_pct: 0
        }
      }
    };

    return NextResponse.json({
      success: true,
      data: mockData
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: '获取队列状态失败'
    }, { status: 500 });
  }
}
