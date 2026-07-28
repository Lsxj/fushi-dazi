import { createORPCClient } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { apiContract } from '@fushi/contracts'

const link = new OpenAPILink(apiContract, {
  url: () => new URL('/api', globalThis.location.origin).toString(),
  fetch: (request, init) => globalThis.fetch(request, init),
})

export const apiClient: JsonifiedClient<
  ContractRouterClient<typeof apiContract>
> = createORPCClient(link)
