import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { apiContract } from '@fushi/contracts'

import { getCloudBaseAccessToken } from '../auth/cloudbase'

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim()

const link = new OpenAPILink(apiContract, {
  url: () =>
    configuredApiUrl || new URL('/api', globalThis.location.origin).toString(),
  fetch: async (request, init) => {
    const accessToken = await getCloudBaseAccessToken()
    const headers = new Headers(request.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return globalThis.fetch(
      new Request(request, { headers, redirect: init?.redirect })
    )
  },
})

export const apiClient: JsonifiedClient<
  ContractRouterClient<typeof apiContract>
> = createORPCClient(link)
