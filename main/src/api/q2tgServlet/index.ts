import { Elysia, t } from 'elysia';
import db from '../../models/db';
import { Pair } from '../../models/Pair';
import OicqClient from '../../client/OicqClient';
import processNestedForward from '../../utils/processNestedForward';

const forwardCache = new Map<string, any>();

let app = new Elysia()
  .post('/Q2tgServlet/GetForwardMultipleMessageApi', async ({ body }) => {
    // @ts-ignore
    const uuid = body.uuid;
    if (!forwardCache.has(uuid)) {
      const data = await db.forwardMultiple.findFirst({
        where: { id: uuid },
      });
      const pair = Pair.getByDbId(data.fromPairId);
      const messages = await pair.qq.getForwardMsg(data.resId, data.fileName);
      if (pair.qqClient instanceof OicqClient) {
        await pair.qqClient.refreshImageRKey(messages);
      }
      await processNestedForward(messages, data.fromPairId);
      forwardCache.set(uuid, messages);

      setTimeout(() => {
        forwardCache.delete(uuid);
      }, 1000 * 60);
    }
    return forwardCache.get(uuid);
  }, {
    body: t.Object({
      // 不许注入
      uuid: t.String({ format: 'uuid' }),
    }),
  });

export default app;
