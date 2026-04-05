import { NextRequest, NextResponse } from 'next/server'

const AICQ_SERVER_URL = process.env.AICQ_SERVER_URL || 'http://localhost:61018'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, 'GET', params)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, 'POST', params)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, 'PUT', params)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, 'DELETE', params)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, 'PATCH', params)
}

async function proxyRequest(
  request: NextRequest,
  method: string,
  paramsPromise: Promise<{ path: string[] }>
) {
  const { path } = await paramsPromise
  const pathStr = path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${AICQ_SERVER_URL}/api/v1/admin/${pathStr}${searchParams ? '?' + searchParams : ''}`

  const headers: Record<string, string> = {}
  // Forward Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    headers['authorization'] = authHeader
  }
  headers['content-type'] = 'application/json'

  const fetchOptions: RequestInit = {
    method,
    headers,
  }

  // Forward body for POST, PUT, PATCH
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const body = await request.text()
    if (body) {
      fetchOptions.body = body
    }
  }

  try {
    const response = await fetch(url, fetchOptions)

    const responseHeaders = new Headers()
    responseHeaders.set('content-type', response.headers.get('content-type') || 'application/json')

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(`Proxy error: ${method} /admin/${pathStr}`, error)
    return NextResponse.json(
      { error: '无法连接到服务器' },
      { status: 502 }
    )
  }
}
