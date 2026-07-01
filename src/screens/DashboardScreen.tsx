import { FlatList, StyleSheet, Text, View } from 'react-native';
import { ClientProfile, Labour } from '../types';

type Props = {
  labours: Labour[];
  client: ClientProfile;
};

export function DashboardScreen({ labours, client }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{client.contractorName}</Text>
        <Text style={styles.title}>{client.contractorTitle}</Text>
        <Text style={styles.subtitle}>Total labourers added</Text>
        <Text style={styles.count}>{labours.length}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Added Labourers</Text>
        <FlatList
          data={labours}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>No labourers have been added yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.phone}>{item.phone}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F6F1',
    padding: 16,
  },
  hero: {
    backgroundColor: '#153D36',
    borderRadius: 8,
    padding: 18,
  },
  kicker: {
    color: '#D9E8C6',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },
  subtitle: {
    color: '#C7DAD3',
    fontSize: 14,
    marginTop: 12,
  },
  count: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '900',
    marginTop: 2,
  },
  panel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    overflow: 'hidden',
  },
  panelTitle: {
    padding: 14,
    color: '#17231F',
    fontSize: 17,
    fontWeight: '900',
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECE8',
  },
  empty: {
    color: '#6B7973',
    padding: 18,
    textAlign: 'center',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },
  avatar: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#CBE0B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#153D36',
    fontWeight: '900',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#17231F',
    fontSize: 15,
    fontWeight: '800',
  },
  phone: {
    color: '#65736D',
    marginTop: 3,
  },
});
