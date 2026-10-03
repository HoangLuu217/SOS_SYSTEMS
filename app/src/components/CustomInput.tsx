import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface CustomInputProps extends TextInputProps {
  iconName: keyof typeof Feather.glyphMap;
  isPassword?: boolean;
}

export const CustomInput: React.FC<CustomInputProps> = ({
  iconName,
  isPassword = false,
  value,
  onChangeText,
  placeholder,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View
      style={[
        styles.container,
        isFocused && styles.containerFocused,
      ]}
    >
      <View style={styles.iconContainer}>
        <Feather
          name={iconName}
          size={19}
          color={isFocused ? '#0066FF' : '#334155'}
        />
      </View>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#475569"
        secureTextEntry={isPassword && !showPassword}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoCorrect={false}
        selectionColor="#0066FF"
        {...rest}
      />

      {isPassword && (
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather
            name={showPassword ? 'eye' : 'eye-off'}
            size={18}
            color="#334155"
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  containerFocused: {
    borderColor: '#0066FF',
    backgroundColor: 'rgba(255, 255, 255, 0.80)',
  },
  iconContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: 22,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
