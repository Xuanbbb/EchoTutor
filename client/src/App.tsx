import './App.css'
import AudioRecorder from './components/AudioRecorder'

const App = () => {
  return (
    <>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>EchoTutor</h1>
        <p style={{ fontSize: '1.2rem', color: '#888' }}>Your Friendly AI English Coach</p>
      </div>
      <AudioRecorder />
    </>
  )
}

export default App
