import { EventEmitter } from 'node:events';
const events = new EventEmitter();
events.setMaxListeners(200);
export const publishCommunicationChange = () => {
  events.emit('change');
};
export const subscribeCommunicationChanges = (listener: () => void) => {
  events.on('change', listener);
  return () => {
    events.off('change', listener);
  };
};
