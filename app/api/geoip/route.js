import { NextResponse } from 'next/server';

export async function GET(request) {
  // Extract the IP address from the request URL
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip');

  if (!ip) {
    return NextResponse.json({ error: 'IP address is required' }, { status: 400 });
  }

  try {
    // The Next.js server makes the HTTP request safely behind the scenes
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await response.json();
    
    // Return the data securely back to your React frontend
    return NextResponse.json(data);
  } catch (error) {
    console.error("Backend fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch geolocation' }, { status: 500 });
  }
}