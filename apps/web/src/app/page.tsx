import { redirect } from 'next/navigation'

/** TacTeQ: 起動時は個別チャットをメイン画面にする */
export default function Home() {
  redirect('/chats')
}
