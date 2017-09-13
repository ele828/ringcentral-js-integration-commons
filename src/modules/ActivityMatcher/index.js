import DataMatcher from '../../lib/DataMatcher';
import { Module } from '../../lib/di';

@Module({
  deps: ['Storage']
})
export default class ActivityMatcher extends DataMatcher {
  constructor({
    ...options
  }) {
    super({
      name: 'activityMatcher',
      ...options
    });
  }
}
