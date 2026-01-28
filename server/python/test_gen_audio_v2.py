import wave
import struct
import math

# Create a 1-second silence mono wav file at 16000Hz
sample_rate = 16000
duration = 1.0
frequency = 440.0

num_samples = int(sample_rate * duration)

with wave.open('test_audio_v2.wav', 'w') as wav_file:
    wav_file.setnchannels(1) # Mono
    wav_file.setsampwidth(2) # 2 bytes per sample (16-bit PCM)
    wav_file.setframerate(sample_rate)
    
    data = []
    for i in range(num_samples):
        # Generate a simple sine wave
        value = int(32767.0 * math.sin(2.0 * math.pi * frequency * i / sample_rate))
        data.append(struct.pack('<h', value))
        
    wav_file.writeframes(b''.join(data))

print("Created test_audio_v2.wav")
