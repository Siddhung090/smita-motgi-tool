import './globals.css'

export const metadata = {
  title: 'Smita Motgi Tool',
  description: 'Create amazing content with AI',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}