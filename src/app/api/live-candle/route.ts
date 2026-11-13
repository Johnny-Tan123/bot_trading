import { NextRequest, NextResponse } from 'next/server';
import { fetchLatestCandle } from '@/lib/market-data';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || 'XAU';
    const timeframe = (searchParams.get('timeframe') as Timeframe) || '1h';

    const candle = await fetchLatestCandle(symbol, timeframe);

    if (!candle) {
      return NextResponse.json({ error: 'Failed to fetch latest candle' }, { status: 404 });
    }

    return NextResponse.json(
      {
        candle,
        price: candle.close,
        time: candle.time,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error: unknown) {
    console.error('Error in live-candle route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
