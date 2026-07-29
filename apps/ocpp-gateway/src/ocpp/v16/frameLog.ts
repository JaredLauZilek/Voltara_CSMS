import { ocpp16 } from '@voltara/shared';
import type { BatchWriter, FrameRow } from '../../db/writers.js';
import { redactPayload } from './redact.js';

/**
 * Persists every frame in both directions.
 *
 * CALLRESULT and CALLERROR frames carry only the message id, not the action
 * they answer, so outbound call actions are remembered until their reply
 * arrives — otherwise half the log viewer's rows would be unlabelled and
 * useless for debugging a charger.
 */
export class FrameLogger {
  private readonly pendingActions = new Map<string, string>();

  constructor(
    private readonly writer: BatchWriter<FrameRow>,
    private readonly tenantId: string,
    private readonly chargePointId: string,
  ) {}

  record(rawMessage: string, outbound: boolean): void {
    let frame: unknown;
    try {
      frame = JSON.parse(rawMessage);
    } catch {
      // Unparseable input is still evidence — keep it as a payload blob.
      this.push({
        direction: outbound ? 'out' : 'in',
        message_type: ocpp16.MESSAGE_TYPE.CALL,
        action: null,
        ocpp_message_id: null,
        payload: { unparseable: rawMessage.slice(0, 2000) },
        error_code: 'RpcFrameworkError',
        error_description: 'Frame was not valid JSON',
      });
      return;
    }

    if (!Array.isArray(frame) || frame.length < 2) return;

    const [messageType, messageId] = frame as [number, string, ...unknown[]];
    const direction = outbound ? 'out' : 'in';

    switch (messageType) {
      case ocpp16.MESSAGE_TYPE.CALL: {
        const action = typeof frame[2] === 'string' ? frame[2] : null;
        // Remember the action in BOTH directions: a call we receive is
        // answered by an outbound CALLRESULT carrying only the message id, and
        // vice versa. Tracking only our own calls left every reply we send
        // unlabelled in the log viewer.
        if (action) this.pendingActions.set(messageId, action);
        this.push({
          direction,
          message_type: messageType,
          action,
          ocpp_message_id: messageId,
          payload: redactPayload(frame[3]),
          error_code: null,
          error_description: null,
        });
        return;
      }

      case ocpp16.MESSAGE_TYPE.CALLRESULT: {
        this.push({
          direction,
          message_type: messageType,
          action: this.takeAction(messageId),
          ocpp_message_id: messageId,
          payload: redactPayload(frame[2]),
          error_code: null,
          error_description: null,
        });
        return;
      }

      case ocpp16.MESSAGE_TYPE.CALLERROR: {
        this.push({
          direction,
          message_type: messageType,
          action: this.takeAction(messageId),
          ocpp_message_id: messageId,
          payload: redactPayload(frame[4]),
          error_code: typeof frame[2] === 'string' ? frame[2] : null,
          error_description: typeof frame[3] === 'string' ? frame[3] : null,
        });
        return;
      }

      default:
        return;
    }
  }

  /** Called when the socket closes so an abandoned call can't leak memory. */
  dispose(): void {
    this.pendingActions.clear();
  }

  private takeAction(messageId: string): string | null {
    const action = this.pendingActions.get(messageId) ?? null;
    if (action) this.pendingActions.delete(messageId);
    return action;
  }

  private push(row: Omit<FrameRow, 'tenant_id' | 'charge_point_id' | 'recorded_at'>): void {
    this.writer.add({
      ...row,
      tenant_id: this.tenantId,
      charge_point_id: this.chargePointId,
      recorded_at: new Date(),
    });
  }
}
