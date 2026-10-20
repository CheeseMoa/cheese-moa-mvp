import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchRoutes, type RouteObject } from 'react-router-dom'
import { routesForHost } from './routes'
import { adminPath } from './paths'
import { isAdminHost } from '../lib/appHost'

afterEach(() => vi.unstubAllEnvs())

const appRoutes: RouteObject[] = [{ path: '/', id: 'public-landing' }]

describe('관리자 도메인 진입점', () => {
  it('관리자 루트와 상세 주소는 관리자 셸 아래에서 매칭된다', () => {
    const routes = routesForHost('admin.cheese-moa.com', appRoutes)
    for (const path of ['/', '/users/42', '/groups/7', '/popups/new', '/operation-settings']) {
      const matched = matchRoutes(routes, path)!
      expect(matched[0].route.path).toBe('/')
      expect(matched[0].route.lazy).toBeTypeOf('function')
      expect(matched[matched.length - 1]?.route.path).not.toBe('*')
    }
    expect(matchRoutes(routes, '/home')?.slice(-1)[0]?.route.path).toBe('*')
    expect(matchRoutes(routes, '/share/key')?.slice(-1)[0]?.route.path).toBe('*')
  })

  it('공개 앱·프리뷰·로컬은 기존 라우트를 사용한다', () => {
    for (const host of [
      'app.cheese-moa.com',
      'dev.cheese-moa.com',
      'localhost',
      'preview.vercel.app',
      'admin.cheese-moa.com.evil.test',
    ]) {
      expect(routesForHost(host, appRoutes)).toBe(appRoutes)
    }
  })

  it('기존 관리자 링크는 상세 경로와 검색 조건을 유지해 새 주소로 이동한다', async () => {
    const routes = routesForHost('admin.cheese-moa.com', appRoutes)
    const loader = routes[0].loader
    if (typeof loader !== 'function') throw new Error('legacy loader missing')
    for (const [path, expected] of [
      ['/admin', '/'],
      ['/admin/', '/'],
      ['/ADMIN/users', '/users'],
      ['/admin//evil.example/path', '/evil.example/path'],
      ['/admin/users/42?tab=credits', '/users/42?tab=credits'],
    ]) {
      const response = (await loader({
        request: new Request(`https://admin.cheese-moa.com${path}`),
        params: {},
        context: {},
      })) as Response
      expect(response.headers.get('Location')).toBe(expected)
    }
  })

  it('관리자 메뉴는 전용 도메인에서 루트, 기존 앱·로컬에서 /admin을 기준으로 한다', () => {
    expect(adminPath('', 'admin.cheese-moa.com')).toBe('/')
    expect(adminPath('/users/42', 'admin.cheese-moa.com')).toBe('/users/42')
    expect(adminPath('/users/42', 'localhost')).toBe('/admin/users/42')
    expect(adminPath('', 'app.cheese-moa.com')).toBe('/admin')
  })

  it('관리자 호스트 설정을 라우트와 메뉴에 동일하게 적용한다', () => {
    vi.stubEnv('VITE_ADMIN_HOST', 'admin-staging.cheese-moa.com')
    expect(isAdminHost('admin.cheese-moa.com')).toBe(false)
    expect(adminPath('/users', 'admin-staging.cheese-moa.com')).toBe('/users')
    expect(routesForHost('admin-staging.cheese-moa.com', appRoutes)).not.toBe(appRoutes)
  })
})
