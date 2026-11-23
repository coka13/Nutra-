export function PhonePreview({ preview, hebrew }: { preview: string; hebrew: boolean }) {

  return (
    <main lang={hebrew ? 'he' : 'en'} dir={hebrew ? 'rtl' : 'ltr'}
      style={{ maxWidth: 440, margin: '12vh auto', padding: 24 }}>
      <h1>Nutra+</h1>
      <p>{hebrew ? 'באייפון, פתחו את Expo Go והיכנסו דרך סמל החשבון לאותו חשבון Expo שבו השתמשתם במחשב. אחר כך לחצו על הכפתור למטה.' : 'On your iPhone, open Expo Go and tap the account icon. Sign in with the same Expo account you used on the computer, then tap the button below.'}</p>
      <p><a href="https://apps.apple.com/app/id982107779" style={{ textDecoration: 'underline' }}>
        {hebrew ? 'הורדת Expo Go מה־App Store' : 'Get Expo Go from the App Store'}
      </a></p>
      {preview && <a className="button primary" href={preview}>
        {hebrew ? 'פתיחת Nutra+\u200E ב־Expo Go' : 'Open Nutra+ in Expo Go'}
      </a>}
    </main>
  );
}
