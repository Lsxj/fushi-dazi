declare namespace WechatMiniprogram {
  interface Wx {
    cloud?: {
      init(opts?: { env?: string; traceUser?: boolean }): void
      callFunction(opts: {
        name: string
        data?: Record<string, any>
        success?: (res: any) => void
        fail?: (err: any) => void
        complete?: (res: any) => void
      }): Promise<any>
      callHTTPFunction?<T = unknown>(opts: {
        name: string
        path: string
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
        data?: Record<string, unknown>
        header?: Record<string, string>
      }): Promise<{ statusCode: number; data: T | string; header?: Record<string, string> }>
    }
    getStorageSync<T = any>(key: string): T
    setStorageSync(key: string, data: any): void
    removeStorageSync(key: string): void
    showToast(opts: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void
    showModal(opts: { title?: string; content?: string; editable?: boolean; placeholderText?: string; showCancel?: boolean; cancelText?: string; cancelColor?: string; confirmText?: string; confirmColor?: string; success?: (res: { confirm: boolean; cancel: boolean; content?: string }) => void }): void
    pageScrollTo(opts: { scrollTop?: number; duration?: number; selector?: string; offsetTop?: number }): void
    showActionSheet(opts: { itemList: string[]; itemColor?: string; success?: (res: { tapIndex: number }) => void; fail?: () => void }): void
    setClipboardData(opts: { data: string; success?: () => void; fail?: (err?: any) => void }): void
    getClipboardData(opts: { success?: (res: { data: string }) => void; fail?: (err?: any) => void }): void
    setNavigationBarTitle(opts: { title: string }): void
    navigateTo(opts: { url: string }): void
    redirectTo(opts: { url: string }): void
    reLaunch(opts: { url: string }): void
    switchTab(opts: { url: string; success?: () => void; fail?: () => void }): void
    navigateBack(opts?: { delta?: number }): void
    getSystemInfoSync(): { statusBarHeight: number; screenWidth: number; screenHeight: number; [k: string]: any }
    getWindowInfo(): { statusBarHeight: number; screenWidth: number; screenHeight: number; [k: string]: any }
    getMenuButtonBoundingClientRect(): { top: number; height: number; bottom: number; left: number; right: number; width: number }
  }

  interface BaseEvent {
    type: string
    timeStamp: number
    target: { id: string; dataset: Record<string, any> }
    currentTarget: { id: string; dataset: Record<string, any> }
    detail?: any
  }

  interface Input extends BaseEvent {
    detail: { value: string; [k: string]: any }
  }

  type TouchEvent = BaseEvent

  namespace App {
    type Constructor = <T extends Record<string, any>>(opts: T) => void
  }
  namespace Page {
    type Constructor = <T extends Record<string, any>>(opts: T) => void
  }
  namespace Component {
    type Constructor = (opts: any) => void
  }
}

declare const wx: WechatMiniprogram.Wx
declare const console: {
  log(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
}
declare function setTimeout(handler: () => void, ms: number): number
