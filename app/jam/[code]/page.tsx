export default function Home() {
  return (
    <div className="app">

      {/* Left Sidebar */}
      <aside className="sidebar">
        <h2>My Music</h2>
        <p>Home</p>
        <p>Search</p>
        <p>Your Library</p>
      </aside>

      {/* Main Content */}
      <main className="content">
        <h1>Good evening</h1>

        <div className="cards">
          <div className="card">Playlist 1</div>
          <div className="card">Playlist 2</div>
          <div className="card">Playlist 3</div>
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="rightbar">
        <h2>Now Playing</h2>
        <p>No song selected</p>
      </aside>

      {/* Bottom Player */}
      <footer className="player">
        <button>⏮</button>
        <button>▶</button>
        <button>⏭</button>
      </footer>

    </div>
  );
}