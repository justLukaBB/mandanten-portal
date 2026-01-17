
import os

file_path = 'd:/AI_Autmation/mandanten-portal/server/server.js'
start_line = 4001
end_line = 5060

insert_text = """
// Test & Simulation Routes
const createAdminTestRouter = require('./routes/admin-test');
app.use('/api', createAdminTestRouter({ 
  clientsData, 
  debtAmountExtractor, 
  creditorContactService, 
  garnishmentCalculator,
  testDataService
}));
"""

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Adjust for 0-based index
start_idx = start_line - 1
end_idx = end_line

# Keep lines before start
new_lines = lines[:start_idx]

# Insert new text
new_lines.append(insert_text + '\n')

# Keep lines after end
new_lines.extend(lines[end_idx:])

# Back up original
import shutil
shutil.copy2(file_path, file_path + '.bak')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Successfully replaced lines {start_line}-{end_line} with new router mount.")
