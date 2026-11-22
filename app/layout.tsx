import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { memberViewCookie } from "./lib/member-view";
import "./globals.css";
import { parseTheme, themeCookie, themeColors } from "./lib/theme";
import { getPageSession, googleConfigured } from "./lib/auth";
import { isModerator } from "./lib/server/http";
import { AuthProvider } from "./components/auth-provider";
import TooltipLayer from "./components/tooltip-layer";
import { Toaster } from "./components/toast";
import PressLayer from "./components/press-layer";
import { ThemeColorSync } from "./components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Varde",
  description:
    "Samferdsel, energi, vann, offentlige bygg og byutvikling i Norge. Se prosjektene, få med deg oppdateringer og diskuter.",
};

async function chosenTheme() {
  return parseTheme((await cookies()).get(themeCookie)?.value);
}
async function memberView() {
  return (await cookies()).get(memberViewCookie)?.value === "1";
}

// The browser's own chrome matches the canvas. Kept static (reading the
// cookie here broke in-place flows such as choosing a username in the
// account panel); ThemeColorSync applies a chosen theme on the client.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [session, theme, viewAsMember] = await Promise.all([
    getPageSession(),
    chosenTheme(),
    memberView(),
  ]);
  return (
    <html
      lang="nb"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-canvas font-sans text-ink antialiased`}
      // The scripts below set a variable and an attribute on it before hydration.
      suppressHydrationWarning
    >
      <head>
        {/*
          How wide a thin scrollbar is here (0 where they overlay), for
          `px-gutter-scroll`: the same box as a `scrollbar-thin` scroller's,
          off-screen rather than hidden, since hidden boxes get no scrollbar.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{const d=document.createElement("div");d.style.cssText="position:absolute;top:-200px;width:100px;height:100px;overflow-y:scroll;scrollbar-width:thin;scrollbar-gutter:stable";document.documentElement.append(d);document.documentElement.style.setProperty("--scrollbar-thin",d.offsetWidth-d.clientWidth+"px");d.remove()})()`,
          }}
        />
        {/*
          Whether the last input was a press (`data-pointer`) or the
          keyboard, so focus rings show for the keyboard only. Browsers
          count focus a script moves as visible after a tap, or after a
          click on something that doesn't take focus itself. Shortcuts
          (and a held Cmd for Cmd-click) don't count as the keyboard.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{const r=document.documentElement;addEventListener("pointerdown",()=>r.setAttribute("data-pointer",""),true);addEventListener("keydown",e=>{if(!e.metaKey&&!e.ctrlKey&&!e.altKey)r.removeAttribute("data-pointer")},true)})()`,
          }}
        />
        {/*
          Browsers with swipe navigation anywhere on the page (Arc Search)
          take a sideways drag as back or forward unless the page cancels
          its first move. A sideways start is cancelled everywhere except
          over a field or a scroller that can still scroll that way, so
          dragging the map, a sheet or a card never leaves the page. The map
          claims all of its moves itself (project-map.tsx).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{let s=null;const o={capture:true,passive:false};addEventListener("touchstart",e=>{const t=e.touches[0];s=e.touches.length===1?{x:t.clientX,y:t.clientY}:null},{capture:true,passive:true});addEventListener("touchmove",e=>{if(!s)return;const t=e.touches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;if(!dx&&!dy)return;s=null;if(!e.cancelable||Math.abs(dx)<=Math.abs(dy))return;for(let n=e.target;n instanceof Element;n=n.parentElement){if(n.matches("input,textarea,select,[contenteditable]"))return;const x=getComputedStyle(n).overflowX;if((x==="auto"||x==="scroll")&&(dx>0?n.scrollLeft>0:n.scrollLeft<n.scrollWidth-n.clientWidth-1))return}e.preventDefault()},o)})()`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <AuthProvider
          initialUser={session?.user ?? null}
          isModerator={!!session && isModerator(session.user)}
          initialMemberView={viewAsMember}
          googleEnabled={googleConfigured()}
        >
          {children}
        </AuthProvider>
        <TooltipLayer />
        <Toaster />
        <PressLayer />
        <ThemeColorSync />
      </body>
    </html>
  );
}
