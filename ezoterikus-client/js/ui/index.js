import { enhanceStatusBar } from './components/StatusBar.js';
import { enhanceFriendList } from './components/FriendList.js';
import { mountFilePicker } from './components/FilePicker.js';

export function enhanceUI(){
  enhanceStatusBar();
  enhanceFriendList();
  mountFilePicker();
}